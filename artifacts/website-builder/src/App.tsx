import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/error-boundary";
import { AuthProvider, ProtectedRoute, useAuth } from "@/lib/auth";
import { Layout } from "@/components/layout";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { apiFetchJson } from "@/lib/api-fetch";
import { lazy, Suspense, useCallback } from "react";
import { SystemGuard } from "@/components/system-guard";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

const Home = lazy(() => import("@/pages/home"));
const Login = lazy(() => import("@/pages/login"));
const Register = lazy(() => import("@/pages/register"));
const VerifyEmail = lazy(() => import("@/pages/verify-email"));
const Order = lazy(() => import("@/pages/order"));
const MyOrders = lazy(() => import("@/pages/my-orders"));
const Testimonials = lazy(() => import("@/pages/testimonials"));
const Admin = lazy(() => import("@/pages/admin"));
const AdminLogin = lazy(() => import("@/pages/admin-login"));
const Terms = lazy(() => import("@/pages/terms"));
const Privacy = lazy(() => import("@/pages/privacy"));
const ForgotPassword = lazy(() => import("@/pages/forgot-password"));
const Chat = lazy(() => import("@/pages/chat"));
const AdminSystemStatus = lazy(() => import("@/pages/admin-system-status"));
const CertificateVerify = lazy(() => import("@/pages/certificate-verify"));

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
  const prefersReducedMotion = useReducedMotion();
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

      <Route path="/certificate/verify" component={CertificateVerify} />

      <Route path="/admin">
        <ProtectedRoute adminOnly>
          <Admin />
        </ProtectedRoute>
      </Route>

      <Route component={Home} />
    </Switch>
  );

  const page = isStandalone ? routes : <Layout>{routes}</Layout>;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location}
        initial={prefersReducedMotion ? false : { opacity: 0, y: 12, filter: "blur(4px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={prefersReducedMotion ? undefined : { opacity: 0, y: -8, filter: "blur(3px)" }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="min-w-0 flex-1"
      >
        <Suspense fallback={<div className="min-h-[60vh] animate-pulse bg-muted/30" aria-label="جاري تحميل الصفحة" />}>
          {page}
        </Suspense>
      </motion.div>
    </AnimatePresence>
  );
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
