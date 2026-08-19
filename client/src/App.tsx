import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Checkout from "./pages/Checkout";
import Validate from "./pages/Validate";
import Admin from "./pages/Admin";
import DiagnosticoExtensao from "./pages/DiagnosticoExtensao";
import Privacy from "./pages/Privacy";
import { SupportWidget } from "./components/SupportWidget";
import { ServiceWorkerRegistration } from "./components/ServiceWorkerRegistration";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/checkout"} component={Checkout} />
      <Route path={"/validar"} component={Validate} />
      <Route path={"/admin"} component={Admin} />
      <Route path={"/diagnostico-extensao"} component={DiagnosticoExtensao} />
      <Route path={"/privacy"} component={Privacy} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
          <SupportWidget />
          <ServiceWorkerRegistration />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
