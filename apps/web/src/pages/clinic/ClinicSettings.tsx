import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useClinicPermissions } from "@/hooks/useClinicPermissions";
import { supabase } from "@/integrations/supabase/client";
import { clinicService } from "@/services/clinic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Save,
  Clock,
  Building2,
  ListOrdered,
  CalendarClock,
  CreditCard,
  Plus,
  Trash2,
  Users,
  Timer,
  Shield,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

interface WorkingDayConfig {
  available?: boolean;
  closed?: boolean;
  open?: string;
  close?: string;
  slots?: Array<{ start: string; end: string }>;
}

interface WorkingHours {
  [day: string]: WorkingDayConfig;
}

interface AppointmentType {
  name: string;
  duration: number;
  label: string;
  price?: number;
}

import { QueueMode } from '@/services/queue/models/QueueModels';

interface DailyQueueModes {
  monday: QueueMode;
  tuesday: QueueMode;
  wednesday: QueueMode;
  thursday: QueueMode;
  friday: QueueMode;
  saturday: QueueMode;
  sunday: QueueMode;
}

interface PaymentMethods {
  cash: boolean;
  card: boolean;
  insurance: boolean;
  online: boolean;
}

type ClinicRow = Database["public"]["Tables"]["clinics"]["Row"];

interface ClinicSettingsShape {
  working_hours?: WorkingHours;
  allow_walk_ins?: boolean;
  average_appointment_duration?: number;
  buffer_time?: number;
  max_queue_size?: number;
  payment_methods?: PaymentMethods;
  appointment_types?: AppointmentType[];
  daily_queue_modes?: DailyQueueModes;
}

const parseClinicSettings = (settings: ClinicRow["settings"] | null): ClinicSettingsShape => {
  if (!settings || typeof settings !== "object") {
    return {};
  }
  return settings as ClinicSettingsShape;
};

const parseQueueMode = (mode: unknown): QueueMode => {
  if (mode === QueueMode.FLUID || mode === QueueMode.SLOTTED) {
    return mode;
  }
  throw new Error(`Unsupported queue mode in clinic settings: ${String(mode)}`);
};

export default function ClinicSettings() {
  const { user, loading } = useAuth();
  const { clinic: scopedClinic, loading: accessLoading, can } = useClinicPermissions();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "basic";

  const canViewSettings = can("view_clinic_settings") || can("manage_clinic_settings");
  const canManageSettings = can("manage_clinic_settings");
  
  const [clinic, setClinic] = useState<ClinicRow | null>(null);
  const [saving, setSaving] = useState(false);

  // Basic Info State
  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");

  // Settings State
  const [workingHours, setWorkingHours] = useState<WorkingHours>({});
  const [allowWalkIns, setAllowWalkIns] = useState(true);
  const [avgDuration, setAvgDuration] = useState(15);
  const [bufferTime, setBufferTime] = useState(5);
  const [maxQueueSize, setMaxQueueSize] = useState(50);

  const [appointmentTypes, setAppointmentTypes] = useState<AppointmentType[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethods>({
    cash: false,
    card: false,
    insurance: false,
    online: false,
  });

  const [dailyQueueModes, setDailyQueueModes] = useState<DailyQueueModes>({
    monday: QueueMode.FLUID,
    tuesday: QueueMode.FLUID,
    wednesday: QueueMode.FLUID,
    thursday: QueueMode.FLUID,
    friday: QueueMode.FLUID,
    saturday: QueueMode.SLOTTED,
    sunday: QueueMode.SLOTTED,
  });

  const fetchClinic = useCallback(async () => {
    if (!scopedClinic?.id) return;
    const { data, error } = await supabase
      .from("clinics")
      .select("*")
      .eq("id", scopedClinic.id)
      .single();

    if (error) {
      toast({
        title: "Error",
        description: "Failed to load clinic data",
        variant: "destructive",
      });
      return;
    }

    if (data) {
      setClinic(data);
      setName(data.name || "");
      setNameAr(data.name_ar || "");
      setSpecialty(data.specialty || "");
      setPhone(data.phone || "");
      setEmail(data.email || "");
      setAddress(data.address || "");
      setCity(data.city || "");

      const settings = parseClinicSettings(data.settings);
      setWorkingHours(settings.working_hours || {});
      setAllowWalkIns(settings.allow_walk_ins ?? true);
      setAvgDuration(settings.average_appointment_duration || 15);
      setBufferTime(settings.buffer_time || 5);
      setMaxQueueSize(settings.max_queue_size || 50);
      setPaymentMethods({
        cash: settings.payment_methods?.cash === true,
        card: settings.payment_methods?.card === true,
        insurance: settings.payment_methods?.insurance === true,
        online: settings.payment_methods?.online === true,
      });
      setAppointmentTypes(Array.isArray(settings.appointment_types) ? settings.appointment_types : []);

      if (settings.daily_queue_modes) {
        const migratedModes: DailyQueueModes = {
          monday: parseQueueMode(settings.daily_queue_modes.monday),
          tuesday: parseQueueMode(settings.daily_queue_modes.tuesday),
          wednesday: parseQueueMode(settings.daily_queue_modes.wednesday),
          thursday: parseQueueMode(settings.daily_queue_modes.thursday),
          friday: parseQueueMode(settings.daily_queue_modes.friday),
          saturday: parseQueueMode(settings.daily_queue_modes.saturday),
          sunday: parseQueueMode(settings.daily_queue_modes.sunday),
        };
        setDailyQueueModes(migratedModes);
      }
    }
  }, [scopedClinic]);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth/login");
      return;
    }
    if (user && scopedClinic?.id) {
      fetchClinic();
    }
  }, [user, loading, navigate, fetchClinic, scopedClinic?.id]);

  const handleSaveBasicInfo = async () => {
    if (!canManageSettings) {
      toast({ title: "Permission denied", description: "You cannot edit clinic settings.", variant: "destructive" });
      return;
    }

    if (!clinic) {
      toast({ title: "Clinic not loaded", description: "Please try again.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await clinicService.updateClinic(clinic.id, { name, nameAr, specialty, phone, email, address, city });
      toast({ title: "Saved", description: "Basic information updated" });
    } catch (error: unknown) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to update", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSchedule = async () => {
    if (!canManageSettings) {
      toast({ title: "Permission denied", description: "You cannot edit clinic settings.", variant: "destructive" });
      return;
    }

    if (!clinic) {
      toast({ title: "Clinic not loaded", description: "Please try again.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const operatingHours: any = {};
      Object.keys(workingHours).forEach(day => {
        const dayData = workingHours[day];
        operatingHours[day] = {
          is_open: !dayData.closed,
          start: dayData.open || "09:00",
          end: dayData.close || "18:00"
        };
      });

      const updatedSettings = {
        ...(clinic.settings as any),
        working_hours: workingHours,
        operating_hours: operatingHours,
        slot_duration: avgDuration,
        allow_walk_ins: allowWalkIns,
        average_appointment_duration: avgDuration,
        buffer_time: bufferTime,
        max_queue_size: maxQueueSize,
        payment_methods: paymentMethods,
        appointment_types: appointmentTypes,
      };

      const { error } = await supabase.from("clinics").update({ settings: updatedSettings }).eq("id", clinic.id);
      if (error) throw error;
      toast({ title: "Saved", description: "Settings updated" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveQueueModes = async () => {
    if (!canManageSettings) {
      toast({ title: "Permission denied", description: "You cannot edit clinic settings.", variant: "destructive" });
      return;
    }

    if (!clinic) return;
    setSaving(true);
    try {
      const updatedSettings = { ...(clinic.settings as any), daily_queue_modes: dailyQueueModes };
      await clinicService.updateClinicSettings(clinic.id, updatedSettings);
      toast({ title: "Saved", description: "Queue configuration updated" });
    } catch (error: unknown) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to update", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const updateDayHours = (day: string, field: keyof WorkingDayConfig, value: WorkingDayConfig[keyof WorkingDayConfig]) => {
    setWorkingHours((prev) => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  };

  const updateDayQueueMode = (day: keyof DailyQueueModes, mode: QueueMode) => {
    setDailyQueueModes((prev) => ({ ...prev, [day]: mode }));
  };

  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

  if (loading || accessLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-border border-t-primary"></div>
      </div>
    );
  }

  if (!canViewSettings) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="max-w-md rounded-lg border border-border bg-card p-8 text-center">
          <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center mx-auto mb-4">
            <Shield className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="font-medium text-foreground mb-1">Permission Required</p>
          <p className="text-sm text-muted-foreground">Your role does not include access to clinic settings.</p>
        </div>
      </div>
    );
  }

  const tabConfig: Record<string, { title: string; description: string; icon: React.ElementType }> = {
    basic: { title: "General", description: "Clinic profile and contact information", icon: Building2 },
    schedule: { title: "Schedule", description: "Working hours and appointment settings", icon: Clock },
    queue: { title: "Queue Mode", description: "Configure how your queue operates", icon: ListOrdered },
    appointments: { title: "Appointments", description: "Appointment types and durations", icon: CalendarClock },
    payment: { title: "Payments", description: "Accepted payment methods", icon: CreditCard },
  };

  const currentTab = tabConfig[activeTab] || tabConfig.basic;
  const TabIcon = currentTab.icon;

  // Shared input styles for sharper look
  const inputClass = "h-9 rounded-[4px] border-border/60 focus:border-foreground/40 transition-colors";
  const selectTriggerClass = "h-9 rounded-[4px] border-border/60";

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2.5 mb-1">
          <TabIcon className="w-4 h-4 text-foreground" />
          <h1 className="text-lg font-semibold tracking-tight">{currentTab.title}</h1>
        </div>
        <p className="text-sm text-muted-foreground">{currentTab.description}</p>
      </div>

      {/* BASIC INFO */}
      {activeTab === "basic" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Clinic Name (English)</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Medical Center" className={inputClass} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Clinic Name (Arabic)</Label>
              <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder="المركز الطبي" dir="rtl" className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Specialty</Label>
              <Input value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="General Practice" className={inputClass} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+212 XXX XXX XXX" className={inputClass} />
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="clinic@example.com" className={inputClass} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Address</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Medical Street" className={inputClass} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">City</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Casablanca" className={inputClass} />
            </div>
          </div>

          <Button onClick={handleSaveBasicInfo} disabled={saving || !canManageSettings} size="sm" className="rounded-[4px] bg-foreground text-background hover:bg-foreground/90">
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      )}

      {/* SCHEDULE */}
      {activeTab === "schedule" && (
        <div className="space-y-8">
          {/* Working Hours */}
          <div>
            <h3 className="text-sm font-medium mb-4">Working Hours</h3>
            <div className="space-y-1.5">
              {days.map((day) => {
                const dayData = workingHours[day] || { closed: false, open: "09:00", close: "18:00" };
                const isClosed = dayData.closed ?? false;
                return (
                  <div key={day} className="flex items-center h-9 gap-4">
                    <span className="w-24 text-sm capitalize text-foreground/80">{day}</span>
                    <Switch
                      checked={!isClosed}
                      onCheckedChange={(checked) => updateDayHours(day, "closed", !checked)}
                      className="data-[state=checked]:bg-foreground"
                    />
                    {!isClosed ? (
                      <div className="flex items-center gap-2 text-sm">
                        <Input
                          type="time"
                          value={dayData.open || "09:00"}
                          onChange={(e) => updateDayHours(day, "open", e.target.value)}
                          className={cn(inputClass, "w-[110px]")}
                        />
                        <span className="text-muted-foreground text-xs">→</span>
                        <Input
                          type="time"
                          value={dayData.close || "18:00"}
                          onChange={(e) => updateDayHours(day, "close", e.target.value)}
                          className={cn(inputClass, "w-[110px]")}
                        />
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">Closed</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Other Settings */}
          <div className="space-y-4">
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-sm font-medium">Walk-ins Allowed</p>
                <p className="text-xs text-muted-foreground">Accept patients without appointments</p>
              </div>
              <Switch checked={allowWalkIns} onCheckedChange={setAllowWalkIns} className="data-[state=checked]:bg-foreground" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Avg. Duration (min)</Label>
                <Input type="number" value={avgDuration} onChange={(e) => setAvgDuration(parseInt(e.target.value) || 15)} min="5" max="120" className={inputClass} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Buffer Time (min)</Label>
                <Input type="number" value={bufferTime} onChange={(e) => setBufferTime(parseInt(e.target.value) || 0)} min="0" max="60" className={inputClass} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Max Queue Size</Label>
                <Input type="number" value={maxQueueSize} onChange={(e) => setMaxQueueSize(parseInt(e.target.value) || 50)} min="1" max="200" className={inputClass} />
              </div>
            </div>
          </div>

          <Button onClick={handleSaveSchedule} disabled={saving || !canManageSettings} size="sm" className="rounded-[4px] bg-foreground text-background hover:bg-foreground/90">
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Saving..." : "Save Schedule"}
          </Button>
        </div>
      )}

      {/* QUEUE MODE */}
      {activeTab === "queue" && (
        <div className="space-y-6">
          {/* Mode Explanation Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="group relative p-4 bg-muted/40 hover:bg-muted/60 transition-colors">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-[4px] bg-foreground flex items-center justify-center flex-shrink-0">
                  <Users className="w-4 h-4 text-background" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-foreground">Free Queue</h4>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    Walk-in style. Patients join in order and are called when ready. Best for high-volume clinics.
                  </p>
                </div>
              </div>
            </div>
            <div className="group relative p-4 bg-muted/40 hover:bg-muted/60 transition-colors">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-[4px] bg-foreground flex items-center justify-center flex-shrink-0">
                  <Timer className="w-4 h-4 text-background" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-foreground">Time Slots</h4>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    Scheduled appointments at specific times. Predictable wait times. Best for planned visits.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Weekly Configuration */}
          <div>
            <h3 className="text-sm font-medium mb-3">Weekly Configuration</h3>
            <div className="space-y-1.5">
              {days.map((day) => {
                const dayKey = day as keyof DailyQueueModes;
                const currentMode = dailyQueueModes[dayKey];
                return (
                  <div key={day} className="flex items-center h-9 gap-4">
                    <span className="w-24 text-sm capitalize text-foreground/80">{day}</span>
                    <Select value={currentMode} onValueChange={(value: QueueMode) => updateDayQueueMode(dayKey, value)}>
                      <SelectTrigger className={cn(selectTriggerClass, "w-36")}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-[4px]">
                        <SelectItem value="fluid" className="rounded-[2px]">
                          <span className="flex items-center gap-2">
                            <Users className="w-3 h-3" />
                            Free Queue
                          </span>
                        </SelectItem>
                        <SelectItem value="slotted" className="rounded-[2px]">
                          <span className="flex items-center gap-2">
                            <Timer className="w-3 h-3" />
                            Time Slots
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-[4px] text-xs"
              onClick={() => setDailyQueueModes({ monday: QueueMode.FLUID, tuesday: QueueMode.FLUID, wednesday: QueueMode.FLUID, thursday: QueueMode.FLUID, friday: QueueMode.FLUID, saturday: QueueMode.FLUID, sunday: QueueMode.FLUID })}
            >
              <Users className="w-3 h-3 mr-1.5" />
              All Free Queue
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-[4px] text-xs"
              onClick={() => setDailyQueueModes({ monday: QueueMode.SLOTTED, tuesday: QueueMode.SLOTTED, wednesday: QueueMode.SLOTTED, thursday: QueueMode.SLOTTED, friday: QueueMode.SLOTTED, saturday: QueueMode.SLOTTED, sunday: QueueMode.SLOTTED })}
            >
              <Timer className="w-3 h-3 mr-1.5" />
              All Time Slots
            </Button>
          </div>

          <Button onClick={handleSaveQueueModes} disabled={saving || !canManageSettings} size="sm" className="rounded-[4px] bg-foreground text-background hover:bg-foreground/90">
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Saving..." : "Save Queue Config"}
          </Button>
        </div>
      )}

      {/* APPOINTMENTS */}
      {activeTab === "appointments" && (
        <div className="space-y-5">
          {/* Header Row */}
          <div className="grid grid-cols-[1fr,90px,90px,36px] gap-3 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
            <span>Type Name</span>
            <span>Duration</span>
            <span>Price</span>
            <span></span>
          </div>

          {/* Appointment Types */}
          <div className="space-y-2">
            {appointmentTypes.map((type, index) => (
              <div key={index} className="grid grid-cols-[1fr,90px,90px,36px] gap-3 items-center group">
                <Input
                  value={type.label}
                  onChange={(e) => {
                    const updated = [...appointmentTypes];
                    updated[index].label = e.target.value;
                    setAppointmentTypes(updated);
                  }}
                  className={inputClass}
                  placeholder="Type name"
                />
                <Input
                  type="number"
                  value={type.duration}
                  onChange={(e) => {
                    const updated = [...appointmentTypes];
                    updated[index].duration = parseInt(e.target.value) || 15;
                    setAppointmentTypes(updated);
                  }}
                  min="5"
                  className={inputClass}
                />
                <Input
                  type="number"
                  value={type.price ?? ''}
                  onChange={(e) => {
                    const updated = [...appointmentTypes];
                    updated[index].price = e.target.value === '' ? undefined : parseFloat(e.target.value);
                    setAppointmentTypes(updated);
                  }}
                  placeholder="—"
                  className={inputClass}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (appointmentTypes.length <= 1) {
                      toast({ title: "Cannot delete", description: "Need at least one type", variant: "destructive" });
                      return;
                    }
                    setAppointmentTypes(appointmentTypes.filter((_, i) => i !== index));
                  }}
                  className="h-9 w-9 rounded-[4px] text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>

          <button
            onClick={() => {
              setAppointmentTypes([...appointmentTypes, { name: `custom_${Date.now()}`, duration: 15, label: "", price: undefined }]);
            }}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add appointment type
          </button>

          <Button onClick={handleSaveSchedule} disabled={saving || !canManageSettings} size="sm" className="rounded-[4px] bg-foreground text-background hover:bg-foreground/90">
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Saving..." : "Save Appointments"}
          </Button>
        </div>
      )}

      {/* PAYMENT */}
      {activeTab === "payment" && (
        <div className="space-y-5">
          <div className="space-y-3">
            {[
              { key: 'cash', label: 'Cash', description: 'Accept cash payments' },
              { key: 'card', label: 'Credit/Debit Card', description: 'Accept card payments' },
              { key: 'insurance', label: 'Insurance', description: 'Accept insurance coverage' },
              { key: 'online', label: 'Online Payment', description: 'Accept online/digital payments' },
            ].map((method) => (
              <div key={method.key} className="flex items-center justify-between py-1.5">
                <div>
                  <p className="text-sm font-medium">{method.label}</p>
                  <p className="text-xs text-muted-foreground">{method.description}</p>
                </div>
                <Switch
                  checked={paymentMethods[method.key as keyof PaymentMethods]}
                  onCheckedChange={(checked) => setPaymentMethods({ ...paymentMethods, [method.key]: checked })}
                  className="data-[state=checked]:bg-foreground"
                />
              </div>
            ))}
          </div>

          <Button onClick={handleSaveSchedule} disabled={saving || !canManageSettings} size="sm" className="rounded-[4px] bg-foreground text-background hover:bg-foreground/90">
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Saving..." : "Save Payments"}
          </Button>
        </div>
      )}
    </div>
  );
}
