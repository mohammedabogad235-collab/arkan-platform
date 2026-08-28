import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/error-boundary";
import { AuthProvider, ProtectedRoute, useAuth } from "@/lib/auth";
import { Layout } from "@/components/layout";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { apiFetchJson } from "@/lib/api-fetch";
import { useCallback } from "react";
import { SystemGuard } from "@/components/system-guard";

import Home from "@/pages/home";
import Login from "@/pages/login";
import Register from "@/pages/register";
import VerifyEmail from "@/pages/verify-email";
import Order from "@/pages/order";
import MyOrders from "@/pages/my-orders";
import Testimonials from "@/pages/testimonials";
import Admin from "@/pages/admin";
import AdminLogin from "@/pages/admin-login";
import Terms from "@/pages/terms";
import Privacy from "@/pages/privacy";
import ForgotPassword from "@/pages/forgot-password";
import Chat from "@/pages/chat";
import AdminSystemStatus from "@/pages/admin-system-status";

const queryClient = new QueryClient();

const ADMIN_STANDALONE_PATHS = ["/admin/login"];

function PushNotificationsBridge() {
  const { isAuthenticated } = useAuth();

  const registerToken = useCallback(
    async (token: string) => {
      // لا نرسل أي شيء للباك إند قبل تسجيل الدخول
      if (!isAuthenticated) return;

      try {
        await apiFetchJson("/api/profile/fcm-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
      } catch (err) {
        // لا نكسر الواجهة لو فشل التسجيل لأي سبب
        // eslint-disable-next-line no-console
        console.error("[Push] failed to save token:", err);
      }
    },
    [isAuthenticated],
  );

  usePushNotifications(registerToken);
  return null;
}

function Router() {
  const [location] = useLocation();
  const isStandalone = ADMIN_STANDALONE_PATHS.some((p) => location === p || location.startsWith(p + "?"));

  const routes = (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/register" component={Register} />
      <Route path="/verify-email" component={VerifyEmail} />
      <Route path="/testimonials" component={Testimonials} />
      <Route path="/terms" component={Terms} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin/system-status">
        <ProtectedRoute adminOnly>
          <AdminSystemStatus />
        </ProtectedRoute>
      </Route>

      <Route path="/order">
        <ProtectedRoute>
          <Order />
        </ProtectedRoute>
      </Route>

      <Route path="/my-orders">
        <ProtectedRoute>
          <MyOrders />
        </ProtectedRoute>
      </Route>

      <Route path="/chat">
        <ProtectedRoute>
          <Chat />
        </ProtectedRoute>
      </Route>

      <Route path="/admin">
        <ProtectedRoute adminOnly>
          <Admin />
        </ProtectedRoute>
      </Route>

      <Route component={Home} />
    </Switch>
  );

  if (isStandalone) return routes;
  return <Layout>{routes}</Layout>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PushNotificationsBridge />
        <TooltipProvider>
          <WouterRouter>
            <ErrorBoundary title="Router runtime error">
              <SystemGuard>
                <Router />
              </SystemGuard>
            </ErrorBoundary>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
