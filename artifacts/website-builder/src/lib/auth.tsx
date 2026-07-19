import { createContext, useContext, useEffect } from "react";
import { useGetMe, User } from "@workspace/api-client-react";
import { useLocation } from "wouter";

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading, error } = useGetMe({
    query: {
      retry: false,
      refetchOnWindowFocus: false,
    }
  });

  return (
    <AuthContext.Provider
      value={{
        user: user || null,
        isLoading,
        isAuthenticated: !!user && !error,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  const isAdminOrSub = user?.role === "admin" || user?.role === "subadmin";

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        setLocation(adminOnly ? "/admin/login" : "/login");
      } else if (adminOnly && !isAdminOrSub) {
        setLocation("/");
      }
    }
  }, [isLoading, isAuthenticated, user, setLocation, adminOnly, isAdminOrSub]);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">جاري التحميل...</div>;
  }

  if (!isAuthenticated || (adminOnly && !isAdminOrSub)) {
    return null;
  }

  return <>{children}</>;
}
