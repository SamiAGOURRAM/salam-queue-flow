// src/hooks/useBookingService.tsx
import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bookingService } from '@/services/booking/BookingService';
import { BookingRequest } from '@/services/booking/types';
import { useToast } from '@/hooks/use-toast';

type QueueMode = 'ordinal_queue' | 'time_grid_fixed' | null;

export const useBookingService = (
  clinicId?: string, 
  selectedDate?: Date,
  appointmentType?: string,
  queueMode?: QueueMode
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
  const shouldFetchSlots = !!clinicId && !!dateStr && !!appointmentType && queueMode === 'time_grid_fixed';
  
  // 🐛 DEBUG: Log the conditions
  useEffect(() => {
    console.log('🔍 shouldFetchSlots calculation:', {
      hasClinicId: !!clinicId,
      hasDateStr: !!dateStr,
      hasAppointmentType: !!appointmentType,
      queueMode,
      isTimeGridMode: queueMode === 'time_grid_fixed',
      RESULT: shouldFetchSlots
    });
  }, [clinicId, dateStr, appointmentType, queueMode, shouldFetchSlots]);

  // Fetch available slots - ONLY if mode is time_grid_fixed
  const { 
    data: availableSlots, 
    isLoading: loadingSlots,
    refetch: refetchSlots,
    error: slotsError
  } = useQuery({
    queryKey: ['available-slots', clinicId, dateStr, appointmentType],
    queryFn: async () => {
      console.log('📞 Calling getAvailableSlotsForMode with:', {
        clinicId,
        dateStr,
        appointmentType
      });

      // Check if method exists
      if (typeof bookingService.getAvailableSlotsForMode !== 'function') {
        console.error('❌ bookingService.getAvailableSlotsForMode is not a function!');
        console.log('Available methods:', Object.keys(bookingService));
        
        // Fallback to old method if new one doesn't exist
        if (typeof bookingService.getAvailableSlots === 'function') {
          console.warn('⚠️ Falling back to getAvailableSlots (old method)');
          return await bookingService.getAvailableSlots(clinicId!, dateStr, appointmentType);
        }
        
        throw new Error('getAvailableSlotsForMode method not found');
      }

      const result = await bookingService.getAvailableSlotsForMode(clinicId!, dateStr, appointmentType);
      
      console.log('✅ Slots received:', {
        slotsCount: result?.slots?.length || 0,
        mode: result?.mode,
        result
      });
      
      return result;
    },
    enabled: shouldFetchSlots,
    refetchInterval: shouldFetchSlots ? 30000 : false,
  });

  // 🐛 DEBUG: Log slots data changes
  useEffect(() => {
    console.log('📊 Available Slots Updated:', {
      availableSlots,
      slotsCount: availableSlots?.slots?.length || 0,
      loading: loadingSlots,
      error: slotsError
    });
  }, [availableSlots, loadingSlots, slotsError]);

  // Real-time subscription - only for time_grid_fixed
  useEffect(() => {
    if (!shouldFetchSlots) return;

    console.log('🔔 Setting up real-time subscription for:', clinicId, dateStr);
    
    const unsubscribe = bookingService.subscribeToSlotUpdates(
      clinicId!,
      dateStr,
      () => {
        console.log('🔄 Real-time update received! Refetching slots...');
        queryClient.invalidateQueries({
          queryKey: ['available-slots', clinicId, dateStr, appointmentType]
        });
      }
    );

    return () => {
      console.log('🔕 Cleaning up real-time subscription');
      unsubscribe();
    };
  }, [shouldFetchSlots, clinicId, dateStr, appointmentType, queryClient]);

  // Book appointment mutation
  const bookAppointmentMutation = useMutation({
    mutationFn: async (request: BookingRequest) => {
      console.log('📞 Booking appointment with:', request);

      // Check if method exists
      if (typeof bookingService.bookAppointmentForMode !== 'function') {
        console.error('❌ bookingService.bookAppointmentForMode is not a function!');
        
        // Fallback to old method
        if (typeof bookingService.bookAppointment === 'function') {
          console.warn('⚠️ Falling back to bookAppointment (old method)');
          return await bookingService.bookAppointment(request);
        }
        
        throw new Error('bookAppointmentForMode method not found');
      }

      return await bookingService.bookAppointmentForMode(request);
    },
    onSuccess: (data) => {
      console.log('✅ Booking success:', data);
      
      if (data.success) {
        const modeText = queueMode === 'ordinal_queue' ? 'Joined Queue!' : 'Booking Confirmed!';
        
        toast({
          title: `✅ ${modeText}`,
          description: `Queue position: #${data.queuePosition}`,
        });
        
        // Only invalidate slots if we're in time_grid_fixed mode
        if (queueMode === 'time_grid_fixed') {
          queryClient.invalidateQueries({ 
            queryKey: ['available-slots', clinicId, dateStr, appointmentType] 
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
      console.error('❌ Booking error:', error);
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
    if (!clinicId || !selectedDate) return;
  
    setIsBooking(true);
    try {
      // Format date in local timezone (not UTC)
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      const localDateStr = `${year}-${month}-${day}`;
  
      console.log('🎫 Creating booking:', {
        clinicId,
        patientId,
        date: localDateStr,
        time: scheduledTime,
        type: appointmentType,
        mode: queueMode
      });

      const result = await bookAppointmentMutation.mutateAsync({
        clinicId,
        patientId,
        appointmentDate: localDateStr,
        scheduledTime: scheduledTime ? `${scheduledTime}:00` : null,
        appointmentType,
        reasonForVisit
      });
      return result;
    } finally {
      setIsBooking(false);
    }
  }, [clinicId, selectedDate, bookAppointmentMutation, queueMode]);

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