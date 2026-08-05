import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, ProtectedRoute } from "@/lib/auth";
import { Layout } from "@/components/layout";

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
import NotFound from "@/pages/not-found";

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

      <Route path="/admin">
        <ProtectedRoute adminOnly>
          <Admin />
        </ProtectedRoute>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );

  if (isStandalone) return routes;
  return <Layout>{routes}</Layout>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
