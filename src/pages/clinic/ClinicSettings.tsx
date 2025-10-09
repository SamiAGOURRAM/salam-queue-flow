import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, Save, Clock, Settings } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface WorkingHours {
  [day: string]: {
    available?: boolean;
    closed?: boolean;
    open?: string;
    close?: string;
    slots?: Array<{ start: string; end: string }>;
  };
}

export default function ClinicSettings() {
  const { user, loading, isClinicOwner, signOut } = useAuth();
  const navigate = useNavigate();
  const [clinic, setClinic] = useState<any>(null);
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

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth/login");
    } else if (!loading && !isClinicOwner) {
      navigate("/clinic/queue");
    } else if (user && isClinicOwner) {
      fetchClinic();
    }
  }, [user, loading, isClinicOwner, navigate]);

  const fetchClinic = async () => {
    const { data, error } = await supabase
      .from("clinics")
      .select("*")
      .eq("owner_id", user?.id)
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

      const settings = (data.settings as any) || {};
      setWorkingHours((settings.working_hours as WorkingHours) || {});
      setAllowWalkIns(settings.allow_walk_ins ?? true);
      setAvgDuration(settings.average_appointment_duration || 15);
      setBufferTime(settings.buffer_time || 5);
      setMaxQueueSize(settings.max_queue_size || 50);
    }
  };

  const handleSaveBasicInfo = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("clinics")
        .update({
          name,
          name_ar: nameAr,
          specialty,
          phone,
          email,
          address,
          city,
        })
        .eq("id", clinic.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Basic information updated",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSchedule = async () => {
    setSaving(true);
    try {
      const updatedSettings = {
        ...(clinic.settings as any),
        working_hours: workingHours,
        allow_walk_ins: allowWalkIns,
        average_appointment_duration: avgDuration,
        buffer_time: bufferTime,
        max_queue_size: maxQueueSize,
      };

      const { error } = await supabase
        .from("clinics")
        .update({ settings: updatedSettings })
        .eq("id", clinic.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Schedule settings updated",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const updateDayHours = (day: string, field: string, value: any) => {
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
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            <span className="text-xl font-bold">{clinic?.name || "QueueMed"}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate("/clinic/dashboard")}>
              Dashboard
            </Button>
            <Button variant="outline" onClick={() => navigate("/clinic/queue")}>
              Live Queue
            </Button>
            <Button variant="outline" onClick={signOut}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
            <Settings className="w-8 h-8" />
            Clinic Settings
          </h1>
          <p className="text-muted-foreground">Manage your clinic information and working hours</p>
        </div>

        <Tabs defaultValue="basic" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="basic">Basic Information</TabsTrigger>
            <TabsTrigger value="schedule">Schedule & Hours</TabsTrigger>
          </TabsList>

          <TabsContent value="basic">
            <Card>
              <CardHeader>
                <CardTitle>Clinic Information</CardTitle>
                <CardDescription>Update your clinic's basic details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Clinic Name (English)</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Medical Center"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nameAr">Clinic Name (Arabic)</Label>
                    <Input
                      id="nameAr"
                      value={nameAr}
                      onChange={(e) => setNameAr(e.target.value)}
                      placeholder="المركز الطبي"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="specialty">Specialty</Label>
                    <Input
                      id="specialty"
                      value={specialty}
                      onChange={(e) => setSpecialty(e.target.value)}
                      placeholder="General Practice"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+212 XXX XXX XXX"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="clinic@example.com"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="address">Address</Label>
                    <Input
                      id="address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="123 Medical Street"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Casablanca"
                    />
                  </div>
                </div>

                <Button onClick={handleSaveBasicInfo} disabled={saving} className="w-full">
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? "Saving..." : "Save Basic Information"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="schedule" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Working Hours
                </CardTitle>
                <CardDescription>Set your clinic's operating hours for each day</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {days.map((day) => (
                  <div key={day} className="flex items-center gap-4 p-4 border rounded-lg">
                    <div className="w-32">
                      <Label className="capitalize">{day}</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={!workingHours[day]?.closed}
                        onCheckedChange={(checked) =>
                          updateDayHours(day, "closed", !checked)
                        }
                      />
                      <span className="text-sm text-muted-foreground">Open</span>
                    </div>
                    {!workingHours[day]?.closed && (
                      <div className="flex items-center gap-2 ml-auto">
                        <Input
                          type="time"
                          value={workingHours[day]?.open || "09:00"}
                          onChange={(e) => updateDayHours(day, "open", e.target.value)}
                          className="w-32"
                        />
                        <span>to</span>
                        <Input
                          type="time"
                          value={workingHours[day]?.close || "18:00"}
                          onChange={(e) => updateDayHours(day, "close", e.target.value)}
                          className="w-32"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Appointment Settings</CardTitle>
                <CardDescription>Configure appointment timing and queue limits</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="avgDuration">Average Appointment Duration (minutes)</Label>
                  <Input
                    id="avgDuration"
                    type="number"
                    value={avgDuration}
                    onChange={(e) => setAvgDuration(parseInt(e.target.value))}
                    min="5"
                    max="120"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bufferTime">Buffer Time Between Appointments (minutes)</Label>
                  <Input
                    id="bufferTime"
                    type="number"
                    value={bufferTime}
                    onChange={(e) => setBufferTime(parseInt(e.target.value))}
                    min="0"
                    max="30"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxQueue">Maximum Queue Size</Label>
                  <Input
                    id="maxQueue"
                    type="number"
                    value={maxQueueSize}
                    onChange={(e) => setMaxQueueSize(parseInt(e.target.value))}
                    min="10"
                    max="200"
                  />
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <Label>Allow Walk-in Patients</Label>
                    <p className="text-sm text-muted-foreground">
                      Accept patients without appointments
                    </p>
                  </div>
                  <Switch checked={allowWalkIns} onCheckedChange={setAllowWalkIns} />
                </div>

                <Button onClick={handleSaveSchedule} disabled={saving} className="w-full">
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? "Saving..." : "Save Schedule Settings"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
