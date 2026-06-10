import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCcw, Search, Shield, ShieldAlert, UserMinus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/services/shared/logging/Logger";

interface SuperAdminUserRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  first_granted_at: string | null;
  has_global_role: boolean | null;
  clinic_scoped_role_count: number | null;
}

interface SuperAdminCandidateRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone_number: string | null;
  is_super_admin: boolean | null;
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function displayName(fullName: string | null, email: string | null, userId: string): string {
  if (fullName && fullName.trim().length > 0) {
    return fullName.trim();
  }

  if (email && email.trim().length > 0) {
    return email.trim();
  }

  return `${userId.slice(0, 8)}...${userId.slice(-4)}`;
}

export default function SuperAdminConsole() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, signOut } = useAuth();

  const [admins, setAdmins] = useState<SuperAdminUserRow[]>([]);
  const [candidates, setCandidates] = useState<SuperAdminCandidateRow[]>([]);

  const [queryDraft, setQueryDraft] = useState("");
  const [activeQuery, setActiveQuery] = useState("");

  const [loadingAdmins, setLoadingAdmins] = useState(true);
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [actionUserId, setActionUserId] = useState<string | null>(null);

  const adminCount = admins.length;

  const fetchAdmins = useCallback(async () => {
    setLoadingAdmins(true);

    try {
      const { data, error } = await supabase.rpc("list_super_admin_users");

      if (error) {
        throw error;
      }

      setAdmins(Array.isArray(data) ? (data as SuperAdminUserRow[]) : []);
    } catch (error) {
      logger.error(
        "Failed to load super admin users",
        error instanceof Error ? error : new Error(String(error)),
        { userId: user?.id }
      );
      toast({
        title: "Unable to load super admin users",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
      setAdmins([]);
    } finally {
      setLoadingAdmins(false);
    }
  }, [toast, user?.id]);

  const searchCandidates = useCallback(
    async (query: string) => {
      setLoadingCandidates(true);

      try {
        const normalized = query.trim();
        const { data, error } = await supabase.rpc("search_super_admin_candidates", {
          p_query: normalized.length > 0 ? normalized : null,
          p_limit: 40,
        });

        if (error) {
          throw error;
        }

        setCandidates(Array.isArray(data) ? (data as SuperAdminCandidateRow[]) : []);
      } catch (error) {
        logger.error(
          "Failed to search super admin candidates",
          error instanceof Error ? error : new Error(String(error)),
          { userId: user?.id, query }
        );
        toast({
          title: "Search failed",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
        setCandidates([]);
      } finally {
        setLoadingCandidates(false);
      }
    },
    [toast, user?.id]
  );

  useEffect(() => {
    void fetchAdmins();
    void searchCandidates("");
  }, [fetchAdmins, searchCandidates]);

  const handleSearch = async () => {
    const normalized = queryDraft.trim();
    setActiveQuery(normalized);
    await searchCandidates(normalized);
  };

  const handleRefresh = async () => {
    await Promise.all([fetchAdmins(), searchCandidates(activeQuery)]);
  };

  const handleGrant = async (targetUserId: string) => {
    setActionUserId(targetUserId);

    try {
      const { error } = await supabase.rpc("grant_super_admin_role", {
        p_target_user_id: targetUserId,
      });

      if (error) {
        throw error;
      }

      toast({
        title: "Super admin granted",
        description: "Role assignment has been updated.",
      });

      await Promise.all([fetchAdmins(), searchCandidates(activeQuery)]);
    } catch (error) {
      logger.error(
        "Failed to grant super admin role",
        error instanceof Error ? error : new Error(String(error)),
        { userId: user?.id, targetUserId }
      );
      toast({
        title: "Grant failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setActionUserId(null);
    }
  };

  const handleRevoke = async (targetUserId: string) => {
    setActionUserId(targetUserId);

    try {
      const { error } = await supabase.rpc("revoke_super_admin_role", {
        p_target_user_id: targetUserId,
      });

      if (error) {
        throw error;
      }

      toast({
        title: "Super admin revoked",
        description: "Role assignment has been updated.",
      });

      await Promise.all([fetchAdmins(), searchCandidates(activeQuery)]);
    } catch (error) {
      logger.error(
        "Failed to revoke super admin role",
        error instanceof Error ? error : new Error(String(error)),
        { userId: user?.id, targetUserId }
      );
      toast({
        title: "Revoke failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setActionUserId(null);
    }
  };

  const superAdminIds = useMemo(() => {
    return new Set(
      admins.map((admin) => admin.user_id)
    );
  }, [admins]);

  return (
    <div className="min-h-screen bg-background py-8 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Platform Controls</p>
            <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Super Admin Console
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage global super-admin access and monitor assignment state.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loadingAdmins || loadingCandidates}>
              <RefreshCcw className="w-4 h-4 mr-1.5" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate("/clinic/profile")}>
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Clinic Profile
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut}>Sign Out</Button>
          </div>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Current Super Admins</CardTitle>
            <CardDescription>
              Global operators with elevated role-management authority.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingAdmins ? (
              <p className="text-sm text-muted-foreground">Loading super admins...</p>
            ) : admins.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground flex items-center gap-2">
                <ShieldAlert className="w-4 h-4" />
                No super admins found. Add at least one super admin before leaving this page.
              </div>
            ) : (
              <div className="rounded-md border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Granted</TableHead>
                      <TableHead>Scope</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {admins.map((admin) => {
                      const isCurrentUser = user?.id === admin.user_id;
                      const disableRevoke = actionUserId === admin.user_id || (isCurrentUser && adminCount <= 1);
                      const scopeLabel = admin.has_global_role
                        ? "Global"
                        : admin.clinic_scoped_role_count && admin.clinic_scoped_role_count > 0
                          ? `Clinic-scoped (${admin.clinic_scoped_role_count})`
                          : "Unknown";

                      return (
                        <TableRow key={admin.user_id}>
                          <TableCell>
                            <div className="space-y-0.5">
                              <p className="text-sm font-medium text-foreground">
                                {displayName(admin.full_name, admin.email, admin.user_id)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {admin.email || admin.user_id}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDateTime(admin.first_granted_at)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={admin.has_global_role ? "default" : "secondary"}>
                              {scopeLabel}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={disableRevoke}
                              onClick={() => handleRevoke(admin.user_id)}
                            >
                              <UserMinus className="w-4 h-4 mr-1.5" />
                              Revoke
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Find Users</CardTitle>
            <CardDescription>
              Search users by name, email, phone, or user ID and grant/revoke super-admin role.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={queryDraft}
                onChange={(event) => setQueryDraft(event.target.value)}
                placeholder="Search by name, email, phone, or user ID"
              />
              <Button onClick={handleSearch} disabled={loadingCandidates}>
                <Search className="w-4 h-4 mr-1.5" />
                Search
              </Button>
            </div>

            {loadingCandidates ? (
              <p className="text-sm text-muted-foreground">Loading candidates...</p>
            ) : candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No users matched your search.</p>
            ) : (
              <div className="rounded-md border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {candidates.map((candidate) => {
                      const candidateIsSuperAdmin = candidate.is_super_admin || superAdminIds.has(candidate.user_id);
                      const isUpdating = actionUserId === candidate.user_id;

                      return (
                        <TableRow key={candidate.user_id}>
                          <TableCell>
                            <div className="space-y-0.5">
                              <p className="text-sm font-medium text-foreground">
                                {displayName(candidate.full_name, candidate.email, candidate.user_id)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {candidate.email || candidate.phone_number || candidate.user_id}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={candidateIsSuperAdmin ? "default" : "secondary"}>
                              {candidateIsSuperAdmin ? "Super Admin" : "Standard User"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {candidateIsSuperAdmin ? (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isUpdating}
                                onClick={() => handleRevoke(candidate.user_id)}
                              >
                                <UserMinus className="w-4 h-4 mr-1.5" />
                                Revoke
                              </Button>
                            ) : (
                              <Button
                                variant="default"
                                size="sm"
                                disabled={isUpdating}
                                onClick={() => handleGrant(candidate.user_id)}
                              >
                                <UserPlus className="w-4 h-4 mr-1.5" />
                                Grant
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
