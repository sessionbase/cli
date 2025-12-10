import { useState, useEffect } from 'react';
import { platformRegistry } from '../../platforms/index.js';
import { SessionInfo } from '../../platforms/types.js';
import { SessionStats } from '../types.js';
import { isAuthenticated } from '../../utils/auth.js';
import { sessionBaseClient } from '../../api/client.js';
import { startOfDay, subDays, format } from 'date-fns';

interface UseSessionDataOptions {
  platform?: string;
  searchQuery?: string;
}

interface UseSessionDataResult {
  sessions: SessionInfo[];
  stats: SessionStats | null;
  isLoading: boolean;
  error: string | null;
  isAuth: boolean;
  userName: string | null;
  refetch: () => void;
}

export function useSessionData(options: UseSessionDataOptions = {}): UseSessionDataResult {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuth, setIsAuth] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      setIsLoading(true);
      setError(null);

      try {
        // Check auth status
        const authStatus = await isAuthenticated();
        if (mounted) {
          setIsAuth(authStatus);
        }

        // Fetch user info for display
        if (authStatus) {
          try {
            const info = await sessionBaseClient.getUserInfo();
            const user =
              info.user?.username ||
              info.user?.name ||
              info.user?.email ||
              null;
            if (mounted) {
              setUserName(user);
            }
          } catch {
            // If user info fails, keep going; auth indicator will still show
          }
        } else {
          if (mounted) {
            setUserName(null);
          }
        }

        // Get available providers
        const providers = await platformRegistry.getAvailableProviders();
        
        // Filter by platform if specified
        const targetProviders = options.platform && options.platform !== 'all'
          ? providers.filter(p => p.platform === options.platform)
          : providers;

        // Fetch sessions from all providers
        const allSessions: SessionInfo[] = [];
        for (const provider of targetProviders) {
          try {
            const providerSessions = await provider.listSessions(undefined, true);
            allSessions.push(...providerSessions);
          } catch (err) {
            // Continue with other providers if one fails
            console.error(`Failed to load sessions from ${provider.displayName}:`, err);
          }
        }

        // Filter by search query
        let filteredSessions = allSessions;
        if (options.searchQuery && options.searchQuery.trim()) {
          const query = options.searchQuery.toLowerCase();
          filteredSessions = allSessions.filter(session => {
            const preview = session.firstMessagePreview?.toLowerCase() || '';
            const title = session.title?.toLowerCase() || '';
            const projectPath = session.projectPath.toLowerCase();
            return preview.includes(query) || title.includes(query) || projectPath.includes(query);
          });
        }

        // Calculate stats
        const calculatedStats = calculateStats(allSessions);

        if (mounted) {
          setSessions(filteredSessions);
          setStats(calculatedStats);
          setIsLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Unknown error');
          setIsLoading(false);
        }
      }
    }

    loadData();

    return () => {
      mounted = false;
    };
  }, [options.platform, options.searchQuery, refetchTrigger]);

  const refetch = () => {
    setRefetchTrigger(prev => prev + 1);
  };

  return {
    sessions,
    stats,
    isLoading,
    error,
    isAuth,
    userName,
    refetch,
  };
}

function calculateStats(sessions: SessionInfo[]): SessionStats {
  const sessionsByPlatform: Record<string, number> = {};
  const activityMap = new Map<string, number>();

  // Count sessions by platform
  for (const session of sessions) {
    const platform = session.platform || 'unknown';
    sessionsByPlatform[platform] = (sessionsByPlatform[platform] || 0) + 1;

    // Track activity by date
    const dateKey = format(startOfDay(session.lastModified), 'yyyy-MM-dd');
    activityMap.set(dateKey, (activityMap.get(dateKey) || 0) + 1);
  }

  // Convert activity map to array
  const recentActivity: Array<{ date: Date; count: number }> = [];
  const today = new Date();
  
  // Generate last 30 days
  for (let i = 29; i >= 0; i--) {
    const date = subDays(today, i);
    const dateKey = format(startOfDay(date), 'yyyy-MM-dd');
    const count = activityMap.get(dateKey) || 0;
    recentActivity.push({ date, count });
  }

  // Find last push date (most recent session)
  const lastPushDate = sessions.length > 0
    ? sessions.reduce((latest, session) => 
        session.lastModified > latest ? session.lastModified : latest
      , sessions[0].lastModified)
    : undefined;

  return {
    totalSessions: sessions.length,
    sessionsByPlatform,
    recentActivity,
    lastPushDate,
  };
}

