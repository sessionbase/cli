export type View = 'dashboard' | 'sessions';

export interface AppState {
  currentView: View;
  selectedPlatform: string | 'all';
  searchQuery: string;
  isLoading: boolean;
}

export interface SessionStats {
  totalSessions: number;
  sessionsByPlatform: Record<string, number>;
  recentActivity: Array<{ date: Date; count: number }>;
  lastPushDate?: Date;
}

