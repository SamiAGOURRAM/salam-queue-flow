// src/hooks/useBookingService.tsx
import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bookingService } from '@/services/booking/BookingService';
import { BookingRequest } from '@/services/booking/types';
import { QueueMode } from '@/services/queue/models/QueueModels';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/services/shared/logging/Logger';

export const useBookingService = (
  clinicId?: string,
  selectedStaffId?: string,
  selectedDate?: Date,
  appointmentType?: string,
  queueMode?: QueueMode | null
) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isBooking, setIsBooking] = useState(false);

  // Fetch clinic info
  const { data: clinicInfo, isLoading: loadingClinic } = useQuery({
    queryKey: ['clinic-info', clinicId],
    queryFn: () => bookingService.getClinicInfo(clinicId!),
    enabled: !!clinicId,
    staleTime: 5 * 60 * 1000,
  });

  // Calculate if we should fetch slots
  const dateStr = selectedDate
  ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`
  : '';
  const shouldFetchSlots = !!clinicId && !!selectedStaffId && !!dateStr && !!appointmentType && queueMode === QueueMode.SLOTTED;

  // Fetch available slots only in slotted mode
  const {
    data: availableSlots,
    isLoading: loadingSlots,
    refetch: refetchSlots,
    error: slotsError
  } = useQuery({
    queryKey: ['available-slots', clinicId, selectedStaffId, dateStr, appointmentType],
    queryFn: async () => {
      logger.debug('Fetching slots for mode', { clinicId, selectedStaffId, dateStr, appointmentType });
      const result = await bookingService.getAvailableSlotsForMode(clinicId!, dateStr, appointmentType!, selectedStaffId!);
      logger.debug('Slots received', { slotsCount: result?.slots?.length || 0, mode: result?.mode });
      return result;
    },
    enabled: shouldFetchSlots,
    refetchInterval: shouldFetchSlots ? 30000 : false,
  });

  // Real-time subscription - only for slotted mode
  useEffect(() => {
    if (!shouldFetchSlots) return;

    const unsubscribe = bookingService.subscribeToSlotUpdates(
      clinicId!,
      dateStr,
      () => {
        queryClient.invalidateQueries({
          queryKey: ['available-slots', clinicId, selectedStaffId, dateStr, appointmentType]
        });
      }
    );

    return () => {
      unsubscribe();
    };
  }, [shouldFetchSlots, clinicId, selectedStaffId, dateStr, appointmentType, queryClient]);

  // Book appointment mutation
  const bookAppointmentMutation = useMutation({
    mutationFn: async (request: BookingRequest) => {
      return await bookingService.bookAppointmentForMode(request);
    },
    onSuccess: (data) => {
      if (data.success) {
        const modeText = queueMode === QueueMode.FLUID ? 'Joined Queue!' : 'Booking Confirmed!';

        toast({
          title: modeText,
          description: `Queue position: #${data.queuePosition}`,
        });

        if (queueMode === QueueMode.SLOTTED) {
          queryClient.invalidateQueries({
            queryKey: ['available-slots', clinicId, selectedStaffId, dateStr, appointmentType]
          });
        }
      } else {
        toast({
          title: "Booking Failed",
          description: data.error || "Please try another time slot.",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      logger.error('Booking failed', error as Error);
      toast({
        title: "Error",
        description: "Failed to book appointment. Please try again.",
        variant: "destructive",
      });
    },
  });

  // bookAppointment callback
  const bookAppointment = useCallback(async (
    patientId: string,
    scheduledTime: string | null,
    appointmentType: string,
    reasonForVisit?: string
  ) => {
    if (!clinicId || !selectedDate || !selectedStaffId) return;

    setIsBooking(true);
    try {
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      const localDateStr = `${year}-${month}-${day}`;

      const result = await bookAppointmentMutation.mutateAsync({
        clinicId,
        staffId: selectedStaffId,
        patientId,
        appointmentDate: localDateStr,
        scheduledTime,
        appointmentType,
        reasonForVisit
      });
      return result;
    } finally {
      setIsBooking(false);
    }
  }, [clinicId, selectedDate, selectedStaffId, bookAppointmentMutation, queueMode]);

  return {
    clinicInfo,
    availableSlots,
    loadingClinic,
    loadingSlots,
    isBooking,
    bookAppointment,
    refetchSlots
  };
};
