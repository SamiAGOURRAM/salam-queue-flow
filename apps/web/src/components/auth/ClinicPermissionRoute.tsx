import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ShieldAlert, Building2, Loader2 } from "lucide-react";
import { useClinicPermissions } from "@/hooks/useClinicPermissions";
import type { ClinicPermissionKey } from "@/lib/clinicRolePermissions";

interface ClinicPermissionRouteProps {
  children: ReactNode;
  requiredPermissions?: ClinicPermissionKey[];
  requiredAnyPermissions?: ClinicPermissionKey[];
  ownerOnly?: boolean;
}

function AccessDenied({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const navigate = useNavigate();

  return (
    <div className="py-16 flex items-center justify-center">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="w-4 h-4" />
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <Button variant="outline" onClick={() => navigate("/clinic/profile")}>Go to Profile</Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function ClinicPermissionRoute({
  children,
  requiredPermissions = [],
  requiredAnyPermissions = [],
  ownerOnly = false,
}: ClinicPermissionRouteProps) {
  const { loading, clinic, isClinicOwnerAtClinic, canAll, can } = useClinicPermissions();

  if (loading) {
    return (
      <div className="py-16 flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        Checking permissions...
      </div>
    );
  }

  if (!clinic) {
    return (
      <div className="py-16 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="w-4 h-4" />
              No Clinic Access
            </CardTitle>
            <CardDescription>
              Your account is not linked to a clinic yet.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (ownerOnly && !isClinicOwnerAtClinic) {
    return (
      <AccessDenied
        title="Owner Access Required"
        description="Only clinic owners can open this page."
      />
    );
  }

  if (requiredPermissions.length > 0 && !canAll(requiredPermissions)) {
    return (
      <AccessDenied
        title="Permission Required"
        description="Your role does not include access to this page."
      />
    );
  }

  if (requiredAnyPermissions.length > 0 && !requiredAnyPermissions.some((permission) => can(permission))) {
    return (
      <AccessDenied
        title="Permission Required"
        description="Your role does not include access to this page."
      />
    );
  }

  return <>{children}</>;
}
