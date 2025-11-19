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
import { Clock, UserCheck, UserX, Plus, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

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

  const timeSlots = generateTimeSlots();
  const getInitials = (name?: string) => !name ? "?" : name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const formatTime = (date: Date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-4">
      {/* Time Slot Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {timeSlots.map((slot, index) => (
          <div
            key={index}
            onClick={() => onSlotClick?.(slot)}
            className={cn(
              "relative p-4 rounded-xl border-2 transition-all cursor-pointer",
              slot.isCurrent
                ? "border-green-500 bg-gradient-to-br from-green-50 to-emerald-50 shadow-lg scale-105"
                : slot.isNext
                ? "border-orange-400 bg-gradient-to-br from-orange-50 to-amber-50 shadow-md"
                : slot.isEmpty
                ? slot.isPast
                  ? "border-gray-200 bg-gray-50/50 opacity-60"
                  : "border-blue-200 bg-blue-50/30 hover:border-blue-300 hover:bg-blue-50 hover:shadow-md"
                : slot.isPast
                ? "border-slate-200 bg-slate-50"
                : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
            )}
          >
            {/* Time Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Clock className={cn(
                  "h-4 w-4",
                  slot.isCurrent ? "text-green-600" : slot.isNext ? "text-orange-600" : "text-slate-500"
                )} />
                <span className={cn(
                  "text-sm font-bold",
                  slot.isCurrent ? "text-green-900" : slot.isNext ? "text-orange-900" : "text-slate-700"
                )}>
                  {formatTime(slot.time)}
                </span>
              </div>
              {slot.isCurrent && (
                <Badge className="bg-green-600 text-white text-xs">Active</Badge>
              )}
              {slot.isNext && !slot.isCurrent && (
                <Badge className="bg-orange-500 text-white text-xs">Next</Badge>
              )}
              {slot.freeTimeRange && !slot.isPast && (
                <Badge variant="outline" className="border-green-400 text-green-600 text-xs">
                  <Plus className="h-3 w-3 mr-1" />Free Time
                </Badge>
              )}
            </div>

            {/* Patient Info, Free Time Range, or Empty State */}
            {slot.freeTimeRange ? (
              // Free Time Range Display
              <div className="text-center py-4">
                <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-2">
                  <Plus className="h-6 w-6 text-green-600" />
                </div>
                <p className="text-xs text-slate-500 font-medium">Free Time</p>
                <p className="text-xs text-slate-400 mt-1">
                  {formatTime(slot.freeTimeRange.start)} - {formatTime(slot.freeTimeRange.end)}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  ({Math.round(slot.freeTimeRange.durationMinutes)} min available)
                </p>
                {!slot.isPast && (
                  <p className="text-xs text-green-600 mt-2 font-medium">Available for booking</p>
                )}
              </div>
            ) : slot.appointment ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Avatar className="h-10 w-10 border-2 border-white shadow-sm">
                    <AvatarFallback className={cn(
                      "text-xs font-bold",
                      slot.isCurrent 
                        ? "bg-gradient-to-br from-green-400 to-emerald-500 text-white"
                        : slot.isNext
                        ? "bg-gradient-to-br from-orange-400 to-amber-500 text-white"
                        : "bg-gradient-to-br from-slate-300 to-slate-400 text-white"
                    )}>
                      {getInitials(slot.appointment.patient?.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate text-slate-900">
                      {slot.appointment.patient?.fullName || 'Patient'}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {slot.appointment.appointmentType}
                    </p>
                  </div>
                </div>

                {/* Status Badges */}
                <div className="flex flex-wrap gap-1">
                  {slot.appointment.isPresent ? (
                    <Badge variant="outline" className="text-green-600 border-green-600 text-xs">
                      <UserCheck className="h-3 w-3 mr-1" />Checked In
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-amber-600 border-amber-600 text-xs">
                      <AlertCircle className="h-3 w-3 mr-1" />Not Present
                    </Badge>
                  )}
                  {slot.appointment.skipReason === SkipReason.PATIENT_ABSENT && (
                    <Badge variant="outline" className="text-red-600 border-red-600 text-xs">
                      <UserX className="h-3 w-3 mr-1" />Absent
                    </Badge>
                  )}
                </div>

                {/* Actions - Only show for non-completed appointments */}
                {slot.appointment.status !== AppointmentStatus.COMPLETED && 
                 slot.appointment.status !== AppointmentStatus.CANCELLED &&
                 slot.appointment.status !== AppointmentStatus.NO_SHOW && (
                  <div className="flex flex-col gap-1.5">
                    {!slot.appointment.isPresent && (slot.appointment.status === AppointmentStatus.WAITING || slot.appointment.status === AppointmentStatus.SCHEDULED) && (
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          onMarkPresent?.(slot.appointment!.id);
                        }}
                        disabled={actionLoading}
                        size="sm"
                        className="w-full bg-green-600 hover:bg-green-700 text-white text-xs"
                      >
                        <UserCheck className="h-3 w-3 mr-1" />Mark Present
                      </Button>
                    )}
                    {slot.appointment.isPresent && slot.appointment.status !== AppointmentStatus.IN_PROGRESS && (
                      <>
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            onMarkNotPresent?.(slot.appointment!.id);
                          }}
                          disabled={actionLoading}
                          size="sm"
                          variant="outline"
                          className="w-full border-amber-300 text-amber-600 hover:bg-amber-50 text-xs"
                        >
                          <AlertCircle className="h-3 w-3 mr-1" />Mark Not Present
                        </Button>
                      </>
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
                        className="w-full border-red-300 text-red-600 hover:bg-red-50 text-xs"
                      >
                        <UserX className="h-3 w-3 mr-1" />Mark Absent
                      </Button>
                    )}
                  </div>
                )}

                {/* Wait Time / Status */}
                {slot.appointment.checkedInAt && slot.appointment.startTime && (
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
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
                  </p>
                )}
                {slot.appointment.startTime && !slot.appointment.checkedInAt && (
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Scheduled for {formatTime(new Date(slot.appointment.startTime))}
                  </p>
                )}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded border-2 border-green-500 bg-green-50"></div>
          <span className="text-xs text-slate-600">Currently Serving</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded border-2 border-orange-400 bg-orange-50"></div>
          <span className="text-xs text-slate-600">Next Patient</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded border-2 border-green-200 bg-green-50"></div>
          <span className="text-xs text-slate-600">Free Time Range (Available)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded border-2 border-slate-200 bg-slate-50 opacity-60"></div>
          <span className="text-xs text-slate-600">Past</span>
        </div>
      </div>
    </div>
  );
}

