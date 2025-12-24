import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { logger } from "@/services/shared/logging/Logger";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Home } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    logger.warn("404 Error: User attempted to access non-existent route", { pathname: location.pathname });
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-[#fafafa] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="mb-6">
          <span className="text-7xl sm:text-8xl font-semibold text-gray-900 tracking-tight">
            404
          </span>
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          Page not found
        </h1>
        <p className="text-sm text-gray-500 mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            onClick={() => navigate(-1)}
            variant="outline"
            className="h-10 px-5 border-gray-200 hover:bg-gray-50 text-sm font-medium rounded-md"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go back
          </Button>
          <Button
            onClick={() => navigate("/")}
            className="h-10 px-5 bg-obsidian hover:bg-obsidian-hover text-white text-sm font-medium rounded-md"
          >
            <Home className="w-4 h-4 mr-2" />
            Home
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
