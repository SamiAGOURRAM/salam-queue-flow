import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Loader2, Pill, Plus, RefreshCw } from 'lucide-react';
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
import { AllergyAlertBanner } from './AllergyAlertBanner';

interface MedicalPassportHeaderProps {
  patientId: string;
  clinicId: string;
  doctorUserId: string;
}

function toLocalDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function MedicalPassportHeader({ patientId, clinicId, doctorUserId }: MedicalPassportHeaderProps) {
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
    if (isBackgroundRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const snapshot = await patientMedicalPassportService.getMedicalPassport(patientId);
      setPassport(snapshot);
    } catch (error) {
      toast({
        title: 'Unable to load medical passport',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadPassport(false);
  }, [patientId]);

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
    const trimmedProblemName = problemName.trim();
    if (!trimmedProblemName) {
      toast({
        title: 'Problem name is required',
        variant: 'destructive',
      });
      return;
    }

    setSavingProblem(true);

    try {
      await patientMedicalPassportService.addProblem({
        patientId,
        clinicId,
        problemName: trimmedProblemName,
        icd10Code: problemCode.trim() || undefined,
        notes: problemNotes.trim() || undefined,
        onsetDate: problemOnsetDate || undefined,
        source: 'clinician',
        recordedBy: doctorUserId,
      });

      toast({
        title: 'Problem added',
        description: 'Active problem list updated.',
      });

      setProblemDialogOpen(false);
      resetProblemForm();
      await loadPassport(true);
    } catch (error) {
      toast({
        title: 'Failed to add problem',
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
        resolvedBy: doctorUserId,
      });
      toast({
        title: 'Problem resolved',
      });
      await loadPassport(true);
    } catch (error) {
      toast({
        title: 'Failed to resolve problem',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setUpdatingRecordId(null);
    }
  };

  const handleAddMedication = async () => {
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
        patientId,
        clinicId,
        medicationName: trimmedMedicationName,
        dosage: medicationDosage.trim() || undefined,
        route: medicationRoute.trim() || undefined,
        frequency: medicationFrequency.trim() || undefined,
        instructions: medicationInstructions.trim() || undefined,
        startedOn: medicationStartDate || undefined,
        expectedEndOn: medicationExpectedEndDate || undefined,
        source: 'clinician',
        recordedBy: doctorUserId,
      });

      toast({
        title: 'Medication added',
        description: 'Current medication list updated.',
      });

      setMedicationDialogOpen(false);
      resetMedicationForm();
      await loadPassport(true);
    } catch (error) {
      toast({
        title: 'Failed to add medication',
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
        stoppedBy: doctorUserId,
      });
      toast({
        title: 'Medication stopped',
      });
      await loadPassport(true);
    } catch (error) {
      toast({
        title: 'Failed to stop medication',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setUpdatingRecordId(null);
    }
  };

  return (
    <div className="space-y-3" data-testid="medical-passport-header">
      <AllergyAlertBanner patientId={patientId} doctorUserId={doctorUserId} />

      <div className="rounded-md border border-border bg-background/40 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Medical Passport</p>
            <p className="text-xs text-muted-foreground">
              Unified active conditions and current medications before prescription.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadPassport(true)} disabled={refreshing || loading}>
            {refreshing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
            Refresh
          </Button>
        </div>

        {loading ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading medical passport...
          </div>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-md border border-border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-amber-600" />
                  <p className="text-sm font-semibold text-foreground">Active Problems</p>
                  <Badge variant="secondary">{activeProblems.length}</Badge>
                </div>
                <Button size="sm" variant="outline" onClick={() => setProblemDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add
                </Button>
              </div>

              {visibleProblems.length === 0 ? (
                <p className="text-xs text-muted-foreground">No active problems recorded.</p>
              ) : (
                <div className="space-y-1.5">
                  {visibleProblems.map((problem) => (
                    <div key={problem.id} className="flex items-start justify-between gap-2 rounded border border-border px-2 py-1.5">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{problem.problemName}</p>
                        {(problem.icd10Code || problem.notes) && (
                          <p className="text-[11px] text-muted-foreground truncate">
                            {problem.icd10Code ? `${problem.icd10Code}${problem.notes ? ' · ' : ''}` : ''}
                            {problem.notes || ''}
                          </p>
                        )}
                      </div>
                      <Button
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
                      +{activeProblems.length - visibleProblems.length} more problems.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-md border border-border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Pill className="w-4 h-4 text-sky-600" />
                  <p className="text-sm font-semibold text-foreground">Current Medications</p>
                  <Badge variant="secondary">{currentMedications.length}</Badge>
                </div>
                <Button size="sm" variant="outline" onClick={() => setMedicationDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add
                </Button>
              </div>

              {visibleMedications.length === 0 ? (
                <p className="text-xs text-muted-foreground">No current medications recorded.</p>
              ) : (
                <div className="space-y-1.5">
                  {visibleMedications.map((medication) => (
                    <div key={medication.id} className="flex items-start justify-between gap-2 rounded border border-border px-2 py-1.5">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{medication.medicationName}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {[medication.dosage, medication.frequency, medication.route].filter(Boolean).join(' · ') ||
                            medication.instructions ||
                            'No dosage details'}
                        </p>
                      </div>
                      <Button
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
        )}
      </div>

      <Dialog open={problemDialogOpen} onOpenChange={setProblemDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Active Problem</DialogTitle>
            <DialogDescription>
              Add a persistent condition to the patient passport.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="problem-name">Problem name</Label>
              <Input id="problem-name" value={problemName} onChange={(event) => setProblemName(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="problem-icd">ICD-10 code (optional)</Label>
              <Input id="problem-icd" value={problemCode} onChange={(event) => setProblemCode(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="problem-onset">Onset date (optional)</Label>
              <Input id="problem-onset" type="date" value={problemOnsetDate} onChange={(event) => setProblemOnsetDate(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="problem-notes">Notes (optional)</Label>
              <Input id="problem-notes" value={problemNotes} onChange={(event) => setProblemNotes(event.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setProblemDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleAddProblem()} disabled={savingProblem}>
              {savingProblem ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
              Save problem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={medicationDialogOpen} onOpenChange={setMedicationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Current Medication</DialogTitle>
            <DialogDescription>
              Keep active medications visible before adding new prescriptions.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="med-name">Medication name</Label>
              <Input id="med-name" value={medicationName} onChange={(event) => setMedicationName(event.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="med-dosage">Dosage</Label>
                <Input id="med-dosage" value={medicationDosage} onChange={(event) => setMedicationDosage(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="med-frequency">Frequency</Label>
                <Input id="med-frequency" value={medicationFrequency} onChange={(event) => setMedicationFrequency(event.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="med-route">Route</Label>
              <Input id="med-route" value={medicationRoute} onChange={(event) => setMedicationRoute(event.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="med-start">Start date</Label>
                <Input id="med-start" type="date" value={medicationStartDate} onChange={(event) => setMedicationStartDate(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="med-end">Expected end date</Label>
                <Input id="med-end" type="date" value={medicationExpectedEndDate} onChange={(event) => setMedicationExpectedEndDate(event.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="med-instructions">Instructions</Label>
              <Input id="med-instructions" value={medicationInstructions} onChange={(event) => setMedicationInstructions(event.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMedicationDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleAddMedication()} disabled={savingMedication}>
              {savingMedication ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
              Save medication
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
