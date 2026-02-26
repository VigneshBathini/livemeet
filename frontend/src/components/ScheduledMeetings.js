import React, { useEffect, useState, useCallback, useMemo, useContext } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { AuthContext } from "./AuthContext";
import axios from "axios";
import CalendarSection from "./calendar/CalendarSection";
import SidePanel from "./calendar/SidePanel";
import "../styles/ScheduledMeetings.css";

const API_URL = "http://localhost:3000";

function ScheduledMeetings() {
  const { user } = useContext(AuthContext);
  const [events, setEvents] = useState([]);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  
  const userId = user?.id;

  const utcToIST = (utcDate) => {
  if (!utcDate) return null;

  // IST = UTC + 5 hours 30 minutes
  return new Date(new Date(utcDate).getTime() + 5.5 * 60 * 60 * 1000);
};



const fetchMeetings = useCallback(async () => {
  if (!userId) return;

  setLoading(true);
  setError("");

  try {
    const token = localStorage.getItem("token");
    const res = await axios.get(`${API_URL}/api/meetings/${userId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    console.log("API response for meetings:", res.data);

    const formattedEvents = res.data.map((m) => {
      const startIST = utcToIST(m.startTime);
      const endIST = utcToIST(m.endTime);

      return {
        id: m.id,
        title: m.title || "Untitled Meeting",
        start: startIST,
        end: endIST,
        host: m.host,
        roomId: m.roomId,
        description: m.description || "",
        status: endIST < new Date() ? "past" : "upcoming",
      };
    });

    console.log("Fetched meetings scheduled page (IST):", formattedEvents);
    setEvents(formattedEvents);
  } catch (err) {
    setError("Failed to load your meetings. Please try again.");
    console.error("Fetch meetings error:", err);
  } finally {
    setLoading(false);
  }
}, [userId]);



  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  useEffect(() => {
    const handleFocus = () => fetchMeetings();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchMeetings]);

  const recentMeetings = useMemo(() => {
    return [...events]
      .filter((ev) => ev.end < new Date())
      .sort((a, b) => b.end - a.end)
      .slice(0, 5);
  }, [events]);

  const joinMeeting = (meeting) => {
    console.log('📅 Joining scheduled meeting:', meeting);
    
    const joinData = {
      roomId: meeting.roomId,
      userName: user?.name || 'Participant',
      userEmail: user?.email || '',
      isHost: meeting.host === user?.email,
      meetingTitle: meeting.title,
      fromScheduled: true,
      fromLogin: true,
      timestamp: Date.now()
    };
    
    console.log('💾 Storing join data:', joinData);
    sessionStorage.setItem('joiningMeeting', JSON.stringify(joinData));
    navigate(`/join/${meeting.roomId}`, {
      state: { fromScheduled: true, fromLogin: true },
    });
    
    setTimeout(() => {
      window.scrollTo(0, 0);
    }, 50);
  };

  // Handle date selection from calendar WITH CURRENT TIME
  const handleDateSelect = (selectedDateTime) => {
    console.log('📅 Selected date with time:', selectedDateTime);
    
    // Format the date for passing to SchedulePage
    const formattedDate = selectedDateTime.toISOString().split('T')[0];
    const hours = selectedDateTime.getHours().toString().padStart(2, '0');
    const minutes = selectedDateTime.getMinutes().toString().padStart(2, '0');
    const selectedTime = `${hours}:${minutes}`;
    
    // Store selected date and time
    const scheduleData = {
      selectedDate: formattedDate,
      selectedDateTime: selectedDateTime.toISOString(),
      selectedTime: selectedTime
    };
    
    sessionStorage.setItem('schedulePrefill', JSON.stringify(scheduleData));
    
    // Navigate to schedule page with state
    navigate('/schedule', { 
      state: { 
        prefillDateTime: selectedDateTime,
        selectedTime: selectedTime,
        prefillDate: selectedDateTime // For backward compatibility
      }
    });
  };

  return (
    <div className="scheduled-meetings-container">
      <CalendarSection
        events={events}
        loading={loading}
        error={error}
        selectedMeeting={selectedMeeting}
        onSelectMeeting={setSelectedMeeting}
        onNavigateToSchedule={() => handleDateSelect(new Date())}
        onSelectDate={handleDateSelect} // Pass the handler
      />
      
      <SidePanel
        recentMeetings={recentMeetings}
        selectedMeeting={selectedMeeting}
        onSelectMeeting={setSelectedMeeting}
        onJoinMeeting={joinMeeting}
        user={user}
      />
    </div>
  );
}

export default ScheduledMeetings;
