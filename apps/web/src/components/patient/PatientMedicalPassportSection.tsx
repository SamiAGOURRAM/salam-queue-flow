import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Loader2, Pill, Plus, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import {
  patientMedicalPassportService,
  type PatientMedicalPassport,
} from '@/services/medical-records';

interface PatientMedicalPassportSectionProps {
  userId: string;
}

function toLocalDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function PatientMedicalPassportSection({ userId }: PatientMedicalPassportSectionProps) {
  const [patientRowId, setPatientRowId] = useState<string | null>(null);
  const [passport, setPassport] = useState<PatientMedicalPassport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [problemDialogOpen, setProblemDialogOpen] = useState(false);
  const [problemName, setProblemName] = useState('');
  const [problemCode, setProblemCode] = useState('');
  const [problemNotes, setProblemNotes] = useState('');
  const [problemOnsetDate, setProblemOnsetDate] = useState('');
  const [savingProblem, setSavingProblem] = useState(false);

  const [medicationDialogOpen, setMedicationDialogOpen] = useState(false);
  const [medicationName, setMedicationName] = useState('');
  const [medicationDosage, setMedicationDosage] = useState('');
  const [medicationRoute, setMedicationRoute] = useState('');
  const [medicationFrequency, setMedicationFrequency] = useState('');
  const [medicationInstructions, setMedicationInstructions] = useState('');
  const [medicationStartDate, setMedicationStartDate] = useState(toLocalDateInputValue(new Date()));
  const [medicationExpectedEndDate, setMedicationExpectedEndDate] = useState('');
  const [savingMedication, setSavingMedication] = useState(false);

  const [updatingRecordId, setUpdatingRecordId] = useState<string | null>(null);

  const activeProblems = passport?.activeProblems ?? [];
  const currentMedications = passport?.currentMedications ?? [];

  const visibleProblems = useMemo(() => activeProblems.slice(0, 5), [activeProblems]);
  const visibleMedications = useMemo(() => currentMedications.slice(0, 5), [currentMedications]);

  const loadPassport = async (isBackgroundRefresh = false) => {
    if (!patientRowId) return;

    if (isBackgroundRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const data = await patientMedicalPassportService.getMedicalPassport(patientRowId);
      setPassport(data);
    } catch (error) {
      toast({
        title: 'Could not load medical history',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('patients')
          .select('id')
          .eq('user_id', userId)
          .eq('is_anonymized', false)
          .maybeSingle();

        if (error || !data) {
          if (!cancelled) {
            setPatientRowId(null);
            setPassport(null);
          }
          return;
        }

        if (cancelled) return;
        setPatientRowId(data.id);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!patientRowId) return;
    void loadPassport(false);
  }, [patientRowId]);

  const resetProblemForm = () => {
    setProblemName('');
    setProblemCode('');
    setProblemNotes('');
    setProblemOnsetDate('');
  };

  const resetMedicationForm = () => {
    setMedicationName('');
    setMedicationDosage('');
    setMedicationRoute('');
    setMedicationFrequency('');
    setMedicationInstructions('');
    setMedicationStartDate(toLocalDateInputValue(new Date()));
    setMedicationExpectedEndDate('');
  };

  const handleAddProblem = async () => {
    if (!patientRowId) return;

    const trimmedProblemName = problemName.trim();
    if (!trimmedProblemName) {
      toast({
        title: 'Condition name is required',
        variant: 'destructive',
      });
      return;
    }

    setSavingProblem(true);
    try {
      await patientMedicalPassportService.addProblem({
        patientId: patientRowId,
        problemName: trimmedProblemName,
        icd10Code: problemCode.trim() || undefined,
        notes: problemNotes.trim() || undefined,
        onsetDate: problemOnsetDate || undefined,
        source: 'patient',
        recordedBy: userId,
      });

      toast({
        title: 'Condition saved',
        description: 'Your active condition list has been updated.',
      });

      setProblemDialogOpen(false);
      resetProblemForm();
      await loadPassport(true);
    } catch (error) {
      toast({
        title: 'Could not save condition',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSavingProblem(false);
    }
  };

  const handleResolveProblem = async (problemId: string) => {
    setUpdatingRecordId(problemId);
    try {
      await patientMedicalPassportService.resolveProblem({
        problemId,
        resolvedBy: userId,
      });
      toast({ title: 'Condition marked as resolved' });
      await loadPassport(true);
    } catch (error) {
      toast({
        title: 'Could not update condition',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setUpdatingRecordId(null);
    }
  };

  const handleAddMedication = async () => {
    if (!patientRowId) return;

    const trimmedMedicationName = medicationName.trim();
    if (!trimmedMedicationName) {
      toast({
        title: 'Medication name is required',
        variant: 'destructive',
      });
      return;
    }

    setSavingMedication(true);
    try {
      await patientMedicalPassportService.addCurrentMedication({
        patientId: patientRowId,
        medicationName: trimmedMedicationName,
        dosage: medicationDosage.trim() || undefined,
        route: medicationRoute.trim() || undefined,
        frequency: medicationFrequency.trim() || undefined,
        instructions: medicationInstructions.trim() || undefined,
        startedOn: medicationStartDate || undefined,
        expectedEndOn: medicationExpectedEndDate || undefined,
        source: 'patient',
        recordedBy: userId,
      });

      toast({
        title: 'Medication saved',
        description: 'Your current medication list has been updated.',
      });

      setMedicationDialogOpen(false);
      resetMedicationForm();
      await loadPassport(true);
    } catch (error) {
      toast({
        title: 'Could not save medication',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSavingMedication(false);
    }
  };

  const handleStopMedication = async (medicationId: string) => {
    setUpdatingRecordId(medicationId);
    try {
      await patientMedicalPassportService.stopCurrentMedication({
        medicationId,
        stoppedBy: userId,
      });
      toast({ title: 'Medication marked as stopped' });
      await loadPassport(true);
    } catch (error) {
      toast({
        title: 'Could not update medication',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setUpdatingRecordId(null);
    }
  };

  if (loading && !patientRowId) {
    return (
      <div className="rounded-xl border border-border bg-background p-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your medical history intake...
        </div>
      </div>
    );
  }

  if (!patientRowId) {
    return (
      <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        We could not load your patient record yet. You can continue and fill your medical history later in Profile.
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="patient-medical-passport-section">
      <div className="rounded-xl border border-border bg-background p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">Medical History Intake</p>
            <p className="text-xs text-muted-foreground">
              Add active conditions and current medications so doctors can prescribe safely.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadPassport(true)}
            disabled={refreshing || loading}
          >
            {refreshing ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="space-y-2 rounded-md border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-amber-600" />
                <p className="text-sm font-semibold text-foreground">Active Conditions</p>
                <Badge variant="secondary">{activeProblems.length}</Badge>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => setProblemDialogOpen(true)}>
                <Plus className="mr-1 h-4 w-4" />
                Add
              </Button>
            </div>

            {visibleProblems.length === 0 ? (
              <p className="text-xs text-muted-foreground">No active conditions yet.</p>
            ) : (
              <div className="space-y-1.5">
                {visibleProblems.map((problem) => (
                  <div key={problem.id} className="flex items-start justify-between gap-2 rounded border border-border px-2 py-1.5">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-foreground">{problem.problemName}</p>
                      {(problem.icd10Code || problem.notes) && (
                        <p className="truncate text-[11px] text-muted-foreground">
                          {problem.icd10Code ? `${problem.icd10Code}${problem.notes ? ' · ' : ''}` : ''}
                          {problem.notes || ''}
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      disabled={updatingRecordId === problem.id}
                      onClick={() => void handleResolveProblem(problem.id)}
                    >
                      Resolve
                    </Button>
                  </div>
                ))}
                {activeProblems.length > visibleProblems.length && (
                  <p className="text-[11px] text-muted-foreground">
                    +{activeProblems.length - visibleProblems.length} more conditions.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2 rounded-md border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Pill className="h-4 w-4 text-sky-600" />
                <p className="text-sm font-semibold text-foreground">Current Medications</p>
                <Badge variant="secondary">{currentMedications.length}</Badge>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => setMedicationDialogOpen(true)}>
                <Plus className="mr-1 h-4 w-4" />
                Add
              </Button>
            </div>

            {visibleMedications.length === 0 ? (
              <p className="text-xs text-muted-foreground">No current medications yet.</p>
            ) : (
              <div className="space-y-1.5">
                {visibleMedications.map((medication) => (
                  <div key={medication.id} className="flex items-start justify-between gap-2 rounded border border-border px-2 py-1.5">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-foreground">{medication.medicationName}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {[medication.dosage, medication.frequency, medication.route].filter(Boolean).join(' · ') ||
                          medication.instructions ||
                          'No dosage details'}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      disabled={updatingRecordId === medication.id}
                      onClick={() => void handleStopMedication(medication.id)}
                    >
                      Stop
                    </Button>
                  </div>
                ))}
                {currentMedications.length > visibleMedications.length && (
                  <p className="text-[11px] text-muted-foreground">
                    +{currentMedications.length - visibleMedications.length} more medications.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={problemDialogOpen} onOpenChange={setProblemDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Active Condition</DialogTitle>
            <DialogDescription>
              Add an ongoing condition that clinics should know about.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="patient-problem-name">Condition name</Label>
              <Input id="patient-problem-name" value={problemName} onChange={(event) => setProblemName(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="patient-problem-icd">Code (optional)</Label>
              <Input id="patient-problem-icd" value={problemCode} onChange={(event) => setProblemCode(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="patient-problem-onset">Onset date (optional)</Label>
              <Input
                id="patient-problem-onset"
                type="date"
                value={problemOnsetDate}
                onChange={(event) => setProblemOnsetDate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="patient-problem-notes">Notes (optional)</Label>
              <Input id="patient-problem-notes" value={problemNotes} onChange={(event) => setProblemNotes(event.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setProblemDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleAddProblem()} disabled={savingProblem}>
              {savingProblem ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Save condition
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={medicationDialogOpen} onOpenChange={setMedicationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Current Medication</DialogTitle>
            <DialogDescription>
              Add medicines you are currently taking.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="patient-medication-name">Medication name</Label>
              <Input
                id="patient-medication-name"
                value={medicationName}
                onChange={(event) => setMedicationName(event.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="patient-medication-dosage">Dosage</Label>
                <Input
                  id="patient-medication-dosage"
                  value={medicationDosage}
                  onChange={(event) => setMedicationDosage(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="patient-medication-frequency">Frequency</Label>
                <Input
                  id="patient-medication-frequency"
                  value={medicationFrequency}
                  onChange={(event) => setMedicationFrequency(event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="patient-medication-route">Route</Label>
              <Input
                id="patient-medication-route"
                value={medicationRoute}
                onChange={(event) => setMedicationRoute(event.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="patient-medication-start">Start date</Label>
                <Input
                  id="patient-medication-start"
                  type="date"
                  value={medicationStartDate}
                  onChange={(event) => setMedicationStartDate(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="patient-medication-end">Expected end date</Label>
                <Input
                  id="patient-medication-end"
                  type="date"
                  value={medicationExpectedEndDate}
                  onChange={(event) => setMedicationExpectedEndDate(event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="patient-medication-instructions">Instructions</Label>
              <Input
                id="patient-medication-instructions"
                value={medicationInstructions}
                onChange={(event) => setMedicationInstructions(event.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMedicationDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleAddMedication()} disabled={savingMedication}>
              {savingMedication ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Save medication
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
