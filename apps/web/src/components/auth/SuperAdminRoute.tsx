import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface SuperAdminRouteProps {
  children: ReactNode;
}

export function SuperAdminRoute({ children }: SuperAdminRouteProps) {
  const navigate = useNavigate();
  const { loading, rolesLoading, hasRole } = useAuth();

  if (loading || rolesLoading) {
    return (
      <div className="py-16 flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        Checking super admin access...
      </div>
    );
  }

  if (!hasRole("super_admin")) {
    return (
      <div className="py-16 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="w-4 h-4" />
              Super Admin Access Required
            </CardTitle>
            <CardDescription>
              Your account is not allowed to access the super admin console.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Button variant="outline" onClick={() => navigate("/clinic/profile")}>
              Go to Clinic Profile
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
