import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/error-boundary";
import { AuthProvider, ProtectedRoute } from "@/lib/auth";
import { Layout } from "@/components/layout";
import { usePushNotifications } from "@/hooks/use-push-notifications";

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

const queryClient = new QueryClient();

const ADMIN_STANDALONE_PATHS = ["/admin/login"];

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
  // Push Notifications init (native only). No email logic touched.
  usePushNotifications();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter>
            <ErrorBoundary title="Router runtime error">
              <Router />
            </ErrorBoundary>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
