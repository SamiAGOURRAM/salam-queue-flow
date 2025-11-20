/**
 * Slotted Queue View
 * Displays appointments in a time-slot grid format (like Doctolib/Qmatic)
 * Shows empty slots, patient assignments, and allows slot management
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { QueueEntry, AppointmentStatus, SkipReason } from "@/services/queue";
import { Clock, UserCheck, UserX, Plus, AlertCircle, Filter, Sun, Moon, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { useState, useMemo, Fragment } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SlottedQueueViewProps {
  schedule: QueueEntry[];
  currentPatient: QueueEntry | null;
  onSlotClick?: (slot: TimeSlot) => void;
  onCheckIn?: (appointmentId: string) => void;
  onMarkAbsent?: (appointmentId: string) => void;
  onMarkPresent?: (appointmentId: string) => void;
  onMarkNotPresent?: (appointmentId: string) => void;
  actionLoading?: boolean;
  gracePeriodMinutes?: number; // From clinic settings, default 15
  workingDayStart?: Date | null;
  workingDayEnd?: Date | null;
}

interface TimeSlot {
  time: Date;
  appointment: QueueEntry | null;
  isEmpty: boolean;
  isPast: boolean;
  isCurrent: boolean;
  isNext: boolean;
  // For free time ranges
  freeTimeRange?: {
    start: Date;
    end: Date;
    durationMinutes: number;
  };
}

type TimeFilter = "all" | "morning" | "afternoon" | "evening";

export function SlottedQueueView({
  schedule,
  currentPatient,
  onSlotClick,
  onCheckIn,
  onMarkAbsent,
  onMarkPresent,
  onMarkNotPresent,
  actionLoading = false,
  gracePeriodMinutes = 15, // Default from clinic settings
  workingDayStart,
  workingDayEnd,
}: SlottedQueueViewProps) {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");

  // Generate time slots - only show upcoming appointments and free time ranges
  const generateTimeSlots = (): TimeSlot[] => {
    const slots: TimeSlot[] = [];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const defaultWorkStart = new Date(today);
    defaultWorkStart.setHours(9, 0, 0, 0);
    const defaultWorkEnd = new Date(today);
    defaultWorkEnd.setHours(18, 0, 0, 0);
    const workStart = new Date(workingDayStart ?? defaultWorkStart);
    const workEndTemp = new Date(workingDayEnd ?? defaultWorkEnd);
    const workEnd = workEndTemp > workStart ? workEndTemp : defaultWorkEnd;

    // Filter out completed or absent appointments - only show upcoming active ones
    const upcomingAppointments = schedule.filter(apt => 
      apt.startTime && 
      apt.skipReason !== SkipReason.PATIENT_ABSENT &&
      apt.status !== AppointmentStatus.COMPLETED &&
      apt.status !== AppointmentStatus.CANCELLED &&
      apt.status !== AppointmentStatus.NO_SHOW
    );

    const addFreeSlot = (start: Date, end: Date) => {
      const clippedEnd = new Date(Math.min(end.getTime(), workEnd.getTime()));
      const futureStart = new Date(Math.max(start.getTime(), now.getTime(), workStart.getTime()));
      if (futureStart >= clippedEnd) return;
      slots.push({
        time: futureStart,
        appointment: null,
        isEmpty: true,
        isPast: futureStart < now,
        isCurrent: false,
        isNext: false,
        freeTimeRange: {
          start: futureStart,
          end,
          durationMinutes: (end.getTime() - futureStart.getTime()) / (1000 * 60),
        },
      });
    };

    if (upcomingAppointments.length === 0) {
      addFreeSlot(workStart, workEnd);
      return slots;
    }

    // Sort appointments by start time
    const sortedAppointments = [...upcomingAppointments].sort((a, b) => {
      const timeA = a.startTime ? new Date(a.startTime).getTime() : Infinity;
      const timeB = b.startTime ? new Date(b.startTime).getTime() : Infinity;
      return timeA - timeB;
    });

    // Determine next patient
    const waitingPresent = sortedAppointments.filter(
      a => (a.status === AppointmentStatus.WAITING || a.status === AppointmentStatus.SCHEDULED) && 
           a.isPresent && 
           a.skipReason !== SkipReason.PATIENT_ABSENT
    );
    const nextAppointmentId = !currentPatient && waitingPresent.length > 0 ? waitingPresent[0]?.id : null;

    // Free time before first appointment
    const firstAppointment = sortedAppointments[0];
    if (firstAppointment?.startTime) {
      addFreeSlot(workStart, new Date(firstAppointment.startTime));
    }

    // Add appointments and free time ranges between them
    for (let i = 0; i < sortedAppointments.length; i++) {
      const appointment = sortedAppointments[i];
      if (!appointment.startTime || !appointment.endTime) continue;

      const apptStart = new Date(appointment.startTime);
      const apptEnd = new Date(appointment.endTime);
      const isCurrent = appointment.id === currentPatient?.id;
      const isNext = appointment.id === nextAppointmentId;

      // Add the appointment slot
      slots.push({
        time: apptStart,
        appointment: appointment,
        isEmpty: false,
        isPast: apptStart < now,
        isCurrent,
        isNext,
      });

      // Add free time range after this appointment (before next one)
      if (i < sortedAppointments.length - 1) {
        const nextAppointment = sortedAppointments[i + 1];
        if (nextAppointment.startTime) {
          const nextApptStart = new Date(nextAppointment.startTime);
          const freeDuration = (nextApptStart.getTime() - apptEnd.getTime()) / (1000 * 60);
          
          if (freeDuration > 0) {
            addFreeSlot(apptEnd, nextApptStart);
          }
        }
      }
    }

    // Add free time after last appointment
    const lastAppointment = sortedAppointments[sortedAppointments.length - 1];
    if (lastAppointment.endTime) {
      const lastApptEnd = new Date(lastAppointment.endTime);
      addFreeSlot(lastApptEnd, workEnd);
    }

    return slots.sort((a, b) => a.time.getTime() - b.time.getTime());
  };

  const allTimeSlots = generateTimeSlots();
  
  // Filter slots by time period
  const filteredSlots = useMemo(() => {
    if (timeFilter === "all") return allTimeSlots;
    
    return allTimeSlots.filter(slot => {
      const hour = slot.time.getHours();
      if (timeFilter === "morning") return hour >= 6 && hour < 12;
      if (timeFilter === "afternoon") return hour >= 12 && hour < 17;
      if (timeFilter === "evening") return hour >= 17 && hour < 22;
      return true;
    });
  }, [allTimeSlots, timeFilter]);

  const getInitials = (name?: string) => !name ? "?" : name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const formatTime = (date: Date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  return (
    <div className="space-y-6">
      {/* Time Filter */}
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-500" />
          <Select value={timeFilter} onValueChange={(value) => setTimeFilter(value as TimeFilter)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Filter by time" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <div className="flex items-center gap-2">
                  <Calendar className="h-3 w-3" />
                  All Day
                </div>
              </SelectItem>
              <SelectItem value="morning">
                <div className="flex items-center gap-2">
                  <Sun className="h-3 w-3" />
                  Morning
                </div>
              </SelectItem>
              <SelectItem value="afternoon">
                <div className="flex items-center gap-2">
                  <Sun className="h-3 w-3" />
                  Afternoon
                </div>
              </SelectItem>
              <SelectItem value="evening">
                <div className="flex items-center gap-2">
                  <Moon className="h-3 w-3" />
                  Evening
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Time Slot Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
        {filteredSlots.length === 0 ? (
          <div className="col-span-full py-12 text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
              <Calendar className="h-8 w-8 text-slate-400" />
            </div>
            <p className="text-slate-600 font-medium">No slots found</p>
            <p className="text-sm text-slate-500 mt-1">
              {timeFilter !== "all" ? `Try adjusting the ${timeFilter} filter` : "No appointments scheduled"}
            </p>
          </div>
        ) : (
          <Fragment key="slots">
            {filteredSlots.map((slot, index) => (
            <div
              key={index}
              onClick={() => onSlotClick?.(slot)}
              className={cn(
                "relative rounded-xl border-2 transition-all cursor-pointer group",
                "transform hover:scale-[1.02] hover:shadow-lg",
                slot.isCurrent
                  ? "border-green-500 bg-gradient-to-br from-green-50 via-emerald-50 to-green-50 shadow-xl ring-2 ring-green-200 ring-offset-2"
                  : slot.isNext
                  ? "border-orange-400 bg-gradient-to-br from-orange-50 via-amber-50 to-orange-50 shadow-lg ring-1 ring-orange-200"
                  : slot.isEmpty
                  ? slot.isPast
                    ? "border-slate-200 bg-slate-50/50 opacity-60"
                    : "border-blue-200 bg-gradient-to-br from-blue-50/50 to-cyan-50/30 hover:border-blue-400 hover:bg-blue-50 hover:shadow-md"
                  : slot.isPast
                  ? "border-slate-200 bg-white/60"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-md"
              )}
            >
              <div className="p-6">
                {/* Time Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className={cn(
                      "p-1.5 rounded-lg",
                      slot.isCurrent ? "bg-green-100" : slot.isNext ? "bg-orange-100" : "bg-slate-100"
                    )}>
                      <Clock className={cn(
                        "h-4 w-4",
                        slot.isCurrent ? "text-green-700" : slot.isNext ? "text-orange-700" : "text-slate-600"
                      )} />
                    </div>
                    <span className={cn(
                      "text-lg font-bold tracking-tight",
                      slot.isCurrent ? "text-green-900" : slot.isNext ? "text-orange-900" : "text-slate-800"
                    )}>
                      {formatTime(slot.time)}
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    {slot.isCurrent && (
                      <Badge className="bg-green-600 text-white text-xs font-medium px-2.5 py-0.5 shadow-sm">
                        Active
                      </Badge>
                    )}
                    {slot.isNext && !slot.isCurrent && (
                      <Badge className="bg-orange-500 text-white text-xs font-medium px-2.5 py-0.5 shadow-sm">
                        Next
                      </Badge>
                    )}
                    {slot.freeTimeRange && !slot.isPast && (
                      <Badge variant="outline" className="border-green-400 text-green-700 text-xs font-medium px-2.5 py-0.5 bg-green-50">
                        <Plus className="h-3 w-3 mr-1" />Free
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Patient Info, Free Time Range, or Empty State */}
                {slot.freeTimeRange ? (
                  // Free Time Range Display
                  <div className="text-center py-6">
                    <div className="h-16 w-16 rounded-full bg-gradient-to-br from-green-100 to-emerald-100 flex items-center justify-center mx-auto mb-4 shadow-sm">
                      <Plus className="h-8 w-8 text-green-600" />
                    </div>
                    <p className="text-sm text-slate-700 font-semibold mb-1">Free Time</p>
                    <p className="text-xs text-slate-500 mb-2">
                      {formatTime(slot.freeTimeRange.start)} - {formatTime(slot.freeTimeRange.end)}
                    </p>
                    <p className="text-xs text-slate-400 mb-3">
                      {Math.round(slot.freeTimeRange.durationMinutes)} min available
                    </p>
                    {!slot.isPast && (
                      <Badge className="bg-green-600 text-white text-xs font-medium px-3 py-1">
                        Available for booking
                      </Badge>
                    )}
                  </div>
                ) : slot.appointment ? (
                  <div className="space-y-4">
                    {/* Patient Info */}
                    <div className="flex items-start gap-3">
                      <Avatar className={cn(
                        "h-14 w-14 border-2 shadow-md flex-shrink-0",
                        slot.isCurrent ? "border-green-300 ring-2 ring-green-200" : 
                        slot.isNext ? "border-orange-300 ring-2 ring-orange-200" : 
                        "border-slate-200"
                      )}>
                        <AvatarFallback className={cn(
                          "text-sm font-bold",
                          slot.isCurrent 
                            ? "bg-gradient-to-br from-green-500 to-emerald-600 text-white"
                            : slot.isNext
                            ? "bg-gradient-to-br from-orange-500 to-amber-600 text-white"
                            : "bg-gradient-to-br from-slate-400 to-slate-500 text-white"
                        )}>
                          {getInitials(slot.appointment.patient?.fullName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="font-semibold text-base truncate text-slate-900 leading-tight">
                          {slot.appointment.patient?.fullName || 'Patient'}
                        </p>
                        <p className="text-sm text-slate-600 truncate">
                          {slot.appointment.appointmentType}
                        </p>
                      </div>
                    </div>

                    {/* Status Badges */}
                    <div className="flex flex-wrap gap-2">
                      {slot.appointment.isPresent ? (
                        <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50 text-xs font-medium px-2.5 py-1">
                          <UserCheck className="h-3 w-3 mr-1.5" />Checked In
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 text-xs font-medium px-2.5 py-1">
                          <AlertCircle className="h-3 w-3 mr-1.5" />Not Present
                        </Badge>
                      )}
                      {slot.appointment.skipReason === SkipReason.PATIENT_ABSENT && (
                        <Badge variant="outline" className="text-red-700 border-red-300 bg-red-50 text-xs font-medium px-2.5 py-1">
                          <UserX className="h-3 w-3 mr-1.5" />Absent
                        </Badge>
                      )}
                    </div>

                    {/* Actions - Only show for non-completed appointments */}
                    {slot.appointment.status !== AppointmentStatus.COMPLETED && 
                     slot.appointment.status !== AppointmentStatus.CANCELLED &&
                     slot.appointment.status !== AppointmentStatus.NO_SHOW && (
                      <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
                        {!slot.appointment.isPresent && (slot.appointment.status === AppointmentStatus.WAITING || slot.appointment.status === AppointmentStatus.SCHEDULED) && (
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              onMarkPresent?.(slot.appointment!.id);
                            }}
                            disabled={actionLoading}
                            size="sm"
                            className="w-full bg-green-600 hover:bg-green-700 text-white text-xs font-medium h-9 shadow-sm"
                          >
                            <UserCheck className="h-3.5 w-3.5 mr-1.5" />Mark Present
                          </Button>
                        )}
                        {slot.appointment.isPresent && slot.appointment.status !== AppointmentStatus.IN_PROGRESS && (
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              onMarkNotPresent?.(slot.appointment!.id);
                            }}
                            disabled={actionLoading}
                            size="sm"
                            variant="outline"
                            className="w-full border-amber-300 text-amber-700 hover:bg-amber-50 text-xs font-medium h-9"
                          >
                            <AlertCircle className="h-3.5 w-3.5 mr-1.5" />Mark Not Present
                          </Button>
                        )}
                        {(slot.appointment.status === AppointmentStatus.WAITING || slot.appointment.status === AppointmentStatus.SCHEDULED) && (
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              onMarkAbsent?.(slot.appointment!.id);
                            }}
                            disabled={actionLoading}
                            size="sm"
                            variant="outline"
                            className="w-full border-red-300 text-red-700 hover:bg-red-50 text-xs font-medium h-9"
                          >
                            <UserX className="h-3.5 w-3.5 mr-1.5" />Mark Absent
                          </Button>
                        )}
                      </div>
                    )}

                    {/* Wait Time / Status */}
                    {slot.appointment.checkedInAt && slot.appointment.startTime && (
                      <div className="flex items-center gap-2 text-xs text-slate-600 pt-2 border-t border-slate-100">
                        <Clock className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                        <span className="font-medium">
                          {(() => {
                            const checkedIn = new Date(slot.appointment.checkedInAt!);
                            const scheduled = new Date(slot.appointment.startTime!);
                            const waitMinutes = (checkedIn.getTime() - scheduled.getTime()) / (1000 * 60);
                            
                            // Use grace period from clinic settings (default 15 minutes)
                            const graceThreshold = gracePeriodMinutes || 15;
                            
                            if (waitMinutes < -graceThreshold) {
                              // Checked in more than grace period early
                              return `Entered ${Math.abs(Math.round(waitMinutes))}m early`;
                            } else if (waitMinutes > graceThreshold) {
                              // Checked in late (beyond grace period)
                              return `Checked in ${Math.round(waitMinutes)}m late`;
                            } else {
                              // On time (within grace period)
                              return `On time`;
                            }
                          })()}
                        </span>
                      </div>
                    )}
                    {slot.appointment.startTime && !slot.appointment.checkedInAt && (
                      <div className="flex items-center gap-2 text-xs text-slate-600 pt-2 border-t border-slate-100">
                        <Clock className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                        <span className="font-medium">
                          Scheduled for {formatTime(new Date(slot.appointment.startTime))}
                        </span>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
            ))}
          </Fragment>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-6 p-5 bg-gradient-to-r from-slate-50 to-slate-100/50 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="h-5 w-5 rounded-md border-2 border-green-500 bg-green-50 shadow-sm"></div>
          <span className="text-sm font-medium text-slate-700">Currently Serving</span>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="h-5 w-5 rounded-md border-2 border-orange-400 bg-orange-50 shadow-sm"></div>
          <span className="text-sm font-medium text-slate-700">Next Patient</span>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="h-5 w-5 rounded-md border-2 border-blue-200 bg-blue-50 shadow-sm"></div>
          <span className="text-sm font-medium text-slate-700">Free Time (Available)</span>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="h-5 w-5 rounded-md border-2 border-slate-200 bg-slate-50 opacity-60 shadow-sm"></div>
          <span className="text-sm font-medium text-slate-700">Past</span>
        </div>
      </div>
    </div>
  );
}

