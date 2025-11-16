import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { clinicService } from "@/services/clinic";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, Save, Clock, Settings } from "lucide-react";
import { toast } from "@/hooks/use-toast";
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
  price?: number;  // NEW: Add this field
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
}

const defaultAppointmentTypes: AppointmentType[] = [
  { name: "consultation", duration: 15, label: "Consultation", price: undefined },
  { name: "follow_up", duration: 10, label: "Follow-up", price: undefined },
  { name: "procedure", duration: 30, label: "Procedure", price: undefined },
  { name: "emergency", duration: 20, label: "Emergency", price: undefined },
];

const defaultPaymentMethods: PaymentMethods = {
  cash: true,
  card: false,
  insurance: false,
  online: false,
};

const parseClinicSettings = (settings: ClinicRow["settings"] | null): ClinicSettingsShape => {
  if (!settings || typeof settings !== "object") {
    return {};
  }
  return settings as ClinicSettingsShape;
};

export default function ClinicSettings() {
  const { user, loading, isClinicOwner, signOut } = useAuth();
  const navigate = useNavigate();
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
  const [appointmentTypes, setAppointmentTypes] = useState<AppointmentType[]>(() => [...defaultAppointmentTypes]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethods>(() => ({ ...defaultPaymentMethods }));

  const fetchClinic = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from("clinics")
      .select("*")
      .eq("owner_id", user.id)
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
      setPaymentMethods(settings.payment_methods || { ...defaultPaymentMethods });
      setAppointmentTypes(settings.appointment_types || [...defaultAppointmentTypes]);
    }
  }, [user]);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth/login");
      return;
    }
    if (user) {
      fetchClinic();
    }
  }, [user, loading, navigate, fetchClinic]);

  const handleSaveBasicInfo = async () => {
    if (!clinic) {
      toast({
        title: "Clinic not loaded",
        description: "Please try again once the clinic data is available.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      // Use ClinicService to update clinic information
      await clinicService.updateClinic(clinic.id, {
        name,
        nameAr,
        specialty,
        phone,
        email,
        address,
        city,
      });

      toast({
        title: "Success",
        description: "Basic information updated",
      });
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update clinic info",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSchedule = async () => {
    if (!clinic) {
      toast({
        title: "Clinic not loaded",
        description: "Please try again once the clinic data is available.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const existingSettings = parseClinicSettings(clinic.settings);
      const updatedSettings: ClinicSettingsShape = {
        ...existingSettings,
        working_hours: workingHours,
        allow_walk_ins: allowWalkIns,
        average_appointment_duration: avgDuration,
        buffer_time: bufferTime,
        max_queue_size: maxQueueSize,
        payment_methods: paymentMethods,
        appointment_types: appointmentTypes,
      };

      // Use ClinicService to update clinic settings
      await clinicService.updateClinicSettings(clinic.id, updatedSettings);

      toast({
        title: "Success",
        description: "Schedule settings updated",
      });
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update schedule",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const updateDayHours = (
    day: string,
    field: keyof WorkingDayConfig,
    value: WorkingDayConfig[keyof WorkingDayConfig]
  ) => {
    setWorkingHours((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        [field]: value,
      },
    }));
  };

  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">

      <main className="container mx-auto px-6 py-8 max-w-5xl">
        <div className="mb-8 space-y-2">
          <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
              <Settings className="w-6 h-6 text-white" />
            </div>
            Clinic Settings
          </h2>
          <p className="text-base text-gray-500">Configure your clinic information and preferences</p>
        </div>

        <Tabs defaultValue="basic" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 h-12 bg-white shadow-sm border-2 p-1">
            <TabsTrigger value="basic" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-cyan-600 data-[state=active]:text-white">Basic Info</TabsTrigger>
            <TabsTrigger value="schedule" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-cyan-600 data-[state=active]:text-white">Schedule</TabsTrigger>
            <TabsTrigger value="appointments" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-cyan-600 data-[state=active]:text-white">Appointments</TabsTrigger>
            <TabsTrigger value="payment" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-cyan-600 data-[state=active]:text-white">Payment</TabsTrigger>
          </TabsList>

          <TabsContent value="basic">
            <Card className="shadow-lg border-0 bg-white">
              <CardHeader className="border-b bg-gradient-to-r from-gray-50 to-blue-50/30">
                <CardTitle className="text-xl">Clinic Information</CardTitle>
                <CardDescription className="text-base">Update your clinic's basic details</CardDescription>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm font-medium">Clinic Name (English)</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Medical Center"
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nameAr" className="text-sm font-medium">Clinic Name (Arabic)</Label>
                    <Input
                      id="nameAr"
                      value={nameAr}
                      onChange={(e) => setNameAr(e.target.value)}
                      placeholder="المركز الطبي"
                      className="h-11"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="specialty" className="text-sm font-medium">Specialty</Label>
                    <Input
                      id="specialty"
                      value={specialty}
                      onChange={(e) => setSpecialty(e.target.value)}
                      placeholder="General Practice"
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-sm font-medium">Phone</Label>
                    <Input
                      id="phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+212 XXX XXX XXX"
                      className="h-11"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="clinic@example.com"
                    className="h-11"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="address" className="text-sm font-medium">Address</Label>
                    <Input
                      id="address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="123 Medical Street"
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city" className="text-sm font-medium">City</Label>
                    <Input
                      id="city"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Casablanca"
                      className="h-11"
                    />
                  </div>
                </div>

                <Button 
                  onClick={handleSaveBasicInfo} 
                  disabled={saving} 
                  className="w-full h-11 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? "Saving..." : "Save Basic Information"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="schedule">
  <Card className="shadow-lg border-0 bg-white">
    <CardHeader className="border-b bg-gradient-to-r from-gray-50 to-blue-50/30">
      <CardTitle className="text-xl flex items-center gap-2">
        <Clock className="w-5 h-5 text-blue-600" />
        Working Hours
      </CardTitle>
      <CardDescription className="text-base">
        Set your clinic's opening and closing hours for each day
      </CardDescription>
    </CardHeader>
    <CardContent className="pt-6 space-y-4">
      {/* Days of the Week */}
      {days.map((day) => {
        const dayData = workingHours[day] || { closed: false, open: "09:00", close: "18:00" };
        const isClosed = dayData.closed ?? false;

        return (
          <div 
            key={day} 
            className="p-4 border-2 rounded-xl hover:border-blue-200 transition-all bg-gradient-to-r from-gray-50 to-blue-50/20"
          >
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              {/* Day Name & Toggle */}
              <div className="flex items-center justify-between md:w-48">
                <Label className="text-base font-semibold capitalize">
                  {day}
                </Label>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${isClosed ? 'text-red-600' : 'text-green-600'}`}>
                    {isClosed ? 'Closed' : 'Open'}
                  </span>
                  <Switch
                    checked={!isClosed}
                    onCheckedChange={(checked) => {
                      updateDayHours(day, "closed", !checked);
                    }}
                    className="data-[state=checked]:bg-green-500"
                  />
                </div>
              </div>

              {/* Time Inputs */}
              {!isClosed && (
                <div className="flex items-center gap-3 flex-1">
                  {/* Opening Time */}
                  <div className="flex-1">
                    <Label className="text-xs text-gray-600 mb-1 block">
                      Opens
                    </Label>
                    <Input
                      type="time"
                      value={dayData.open || "09:00"}
                      onChange={(e) => updateDayHours(day, "open", e.target.value)}
                      className="h-11 text-center font-medium"
                    />
                  </div>

                  {/* Arrow */}
                  <div className="mt-5">
                    <svg 
                      width="20" 
                      height="20" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke="currentColor" 
                      strokeWidth="2" 
                      className="text-gray-400"
                    >
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  </div>

                  {/* Closing Time */}
                  <div className="flex-1">
                    <Label className="text-xs text-gray-600 mb-1 block">
                      Closes
                    </Label>
                    <Input
                      type="time"
                      value={dayData.close || "18:00"}
                      onChange={(e) => updateDayHours(day, "close", e.target.value)}
                      className="h-11 text-center font-medium"
                    />
                  </div>
                </div>
              )}

              {/* Closed Message */}
              {isClosed && (
                <div className="flex-1 text-center py-2 px-4 bg-red-50 rounded-lg">
                  <p className="text-sm text-red-600 font-medium">
                    Clinic closed on this day
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Quick Actions */}
      <div className="flex gap-3 pt-4 border-t">
        <Button
          variant="outline"
          onClick={() => {
            const updated: WorkingHours = {};
            days.forEach(day => {
              updated[day] = { closed: false, open: "09:00", close: "18:00" };
            });
            setWorkingHours(updated);
            toast({
              title: "Schedule Reset",
              description: "All days set to 9:00 AM - 6:00 PM",
            });
          }}
          className="flex-1"
        >
          Reset to Default
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const updated: WorkingHours = {};
            days.forEach(day => {
              if (day === 'saturday' || day === 'sunday') {
                updated[day] = { closed: true };
              } else {
                updated[day] = { closed: false, open: "09:00", close: "18:00" };
              }
            });
            setWorkingHours(updated);
            toast({
              title: "Weekend Closed",
              description: "Saturday & Sunday marked as closed",
            });
          }}
          className="flex-1"
        >
          Close Weekends
        </Button>
      </div>

      {/* Other Settings */}
      <div className="space-y-4 pt-6 border-t">
        {/* Allow Walk-ins */}
        <div className="flex items-center justify-between p-4 border rounded-xl bg-gradient-to-r from-gray-50 to-blue-50/20">
          <div>
            <Label className="text-base font-semibold">Walk-ins Allowed</Label>
            <p className="text-sm text-muted-foreground">
              Allow patients without appointments
            </p>
          </div>
          <Switch
            checked={allowWalkIns}
            onCheckedChange={setAllowWalkIns}
          />
        </div>

        {/* Average Duration */}
        <div>
          <Label className="text-base font-semibold mb-2 block">
            Average Appointment Duration (minutes)
          </Label>
          <Input
            type="number"
            value={avgDuration}
            onChange={(e) => setAvgDuration(parseInt(e.target.value) || 15)}
            min="5"
            max="120"
            className="h-11"
          />
        </div>

        {/* Buffer Time */}
        <div>
          <Label className="text-base font-semibold mb-2 block">
            Buffer Time Between Appointments (minutes)
          </Label>
          <Input
            type="number"
            value={bufferTime}
            onChange={(e) => setBufferTime(parseInt(e.target.value) || 0)}
            min="0"
            max="60"
            className="h-11"
          />
        </div>

        {/* Max Queue Size */}
        <div>
          <Label className="text-base font-semibold mb-2 block">
            Maximum Queue Size
          </Label>
          <Input
            type="number"
            value={maxQueueSize}
            onChange={(e) => setMaxQueueSize(parseInt(e.target.value) || 50)}
            min="1"
            max="200"
            className="h-11"
          />
        </div>
      </div>

      {/* Save Button */}
      <Button
        onClick={handleSaveSchedule}
        disabled={saving}
        className="w-full h-12 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg hover:shadow-xl transition-all"
      >
        <Save className="w-5 h-5 mr-2" />
        {saving ? "Saving..." : "Save Schedule Settings"}
      </Button>
    </CardContent>
  </Card>
</TabsContent>

          <TabsContent value="appointments">
            <Card className="shadow-lg border-0 bg-white">
              <CardHeader className="border-b bg-gradient-to-r from-gray-50 to-blue-50/30">
                <CardTitle className="text-xl">Appointment Types</CardTitle>
                <CardDescription className="text-base">
                  Configure the types of appointments you offer and their typical duration
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
              {appointmentTypes.map((type, index) => (
              <div key={index} className="flex items-center gap-4 p-4 border rounded-lg hover:border-blue-300 transition-colors">
                <div className="flex-1 grid grid-cols-3 gap-4">
                  {/* Type Name */}
                  <div>
                    <Label htmlFor={`type-label-${index}`} className="text-sm font-medium">
                      Type Name
                    </Label>
                    <Input
                      id={`type-label-${index}`}
                      value={type.label}
                      onChange={(e) => {
                        const updated = [...appointmentTypes];
                        updated[index].label = e.target.value;
                        setAppointmentTypes(updated);
                      }}
                      placeholder="e.g., Consultation"
                      className="h-11"
                    />
                  </div>

                  {/* Duration */}
                  <div>
                    <Label htmlFor={`type-duration-${index}`} className="text-sm font-medium">
                      Duration (min)
                    </Label>
                    <Input
                      id={`type-duration-${index}`}
                      type="number"
                      value={type.duration}
                      onChange={(e) => {
                        const updated = [...appointmentTypes];
                        updated[index].duration = parseInt(e.target.value) || 15;
                        setAppointmentTypes(updated);
                      }}
                      min="5"
                      max="240"
                      placeholder="15"
                      className="h-11"
                    />
                  </div>

                  {/* NEW: Price Field */}
                  <div>
                    <Label htmlFor={`type-price-${index}`} className="text-sm font-medium">
                      Price (MAD) <span className="text-gray-400 font-normal">- Optional</span>
                    </Label>
                    <div className="relative">
                      <Input
                        id={`type-price-${index}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={type.price ?? ''}
                        onChange={(e) => {
                          const updated = [...appointmentTypes];
                          const value = e.target.value;
                          updated[index].price = value === '' ? undefined : parseFloat(value);
                          setAppointmentTypes(updated);
                        }}
                        placeholder="Free"
                        className="h-11 pr-14"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-medium">
                        MAD
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Delete Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (appointmentTypes.length <= 1) {
                      toast({
                        title: "Cannot Delete",
                        description: "You must have at least one appointment type",
                        variant: "destructive",
                      });
                      return;
                    }
                    
                    const confirmed = window.confirm(
                      `Are you sure you want to delete "${type.label}"?`
                    );
                    
                    if (confirmed) {
                      const updated = appointmentTypes.filter((_, i) => i !== index);
                      setAppointmentTypes(updated);
                      toast({
                        title: "Type Deleted",
                        description: `"${type.label}" has been removed`,
                      });
                    }
                  }}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    <line x1="10" x2="10" y1="11" y2="17" />
                    <line x1="14" x2="14" y1="11" y2="17" />
                  </svg>
                </Button>
              </div>
            ))}

                {/* Add New Type Button */}
                <Button
                  variant="outline"
                  onClick={() => {
                    const newType: AppointmentType = {
                      name: `custom_type_${Date.now()}`,
                      duration: 15,
                      label: "New Appointment Type",
                      price: undefined,  // NEW: Add price field
                    };
                    setAppointmentTypes([...appointmentTypes, newType]);
                    toast({
                      title: "Type Added",
                      description: "New appointment type added. Don't forget to save!",
                    });
                  }}
                  className="w-full h-11 border-2 border-dashed border-blue-300 hover:border-blue-500 hover:bg-blue-50 text-blue-600"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mr-2"
                  >
                    <path d="M5 12h14" />
                    <path d="M12 5v14" />
                  </svg>
                  Add New Appointment Type
                </Button>

                {/* Save Button */}
                <Button
                  onClick={handleSaveSchedule}
                  disabled={saving}
                  className="w-full h-11 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? "Saving..." : "Save Appointment Types"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payment">
            <Card className="shadow-lg border-0 bg-white">
              <CardHeader className="border-b bg-gradient-to-r from-gray-50 to-blue-50/30">
                <CardTitle className="text-xl">Payment Methods</CardTitle>
                <CardDescription className="text-base">Select which payment methods you accept</CardDescription>
              </CardHeader>
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <Label>Cash</Label>
                    <p className="text-sm text-muted-foreground">Accept cash payments</p>
                  </div>
                  <Switch
                    checked={paymentMethods.cash}
                    onCheckedChange={(checked) =>
                      setPaymentMethods({ ...paymentMethods, cash: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <Label>Credit/Debit Card</Label>
                    <p className="text-sm text-muted-foreground">Accept card payments</p>
                  </div>
                  <Switch
                    checked={paymentMethods.card}
                    onCheckedChange={(checked) =>
                      setPaymentMethods({ ...paymentMethods, card: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <Label>Insurance</Label>
                    <p className="text-sm text-muted-foreground">Accept insurance coverage</p>
                  </div>
                  <Switch
                    checked={paymentMethods.insurance}
                    onCheckedChange={(checked) =>
                      setPaymentMethods({ ...paymentMethods, insurance: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <Label>Online Payment</Label>
                    <p className="text-sm text-muted-foreground">Accept online/digital payments</p>
                  </div>
                  <Switch
                    checked={paymentMethods.online}
                    onCheckedChange={(checked) =>
                      setPaymentMethods({ ...paymentMethods, online: checked })
                    }
                  />
                </div>

                <Button 
                  onClick={handleSaveSchedule} 
                  disabled={saving} 
                  className="w-full h-11 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg mt-3"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? "Saving..." : "Save Payment Settings"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
