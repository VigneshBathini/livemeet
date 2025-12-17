import React, { useEffect, useState, useCallback, useMemo, useContext } from "react";
import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import format from "date-fns/format";
import parse from "date-fns/parse";
import startOfWeek from "date-fns/startOfWeek";
import getDay from "date-fns/getDay";
import enUS from "date-fns/locale/en-US";
import "react-big-calendar/lib/css/react-big-calendar.css";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "./AuthContext";

const locales = { "en-US": enUS };

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

// const API_URL = process.env.API_URL || "http://localhost:3000";
const API_URL = "https://livemeet-ribm.onrender.com";

function ScheduledMeetings() {
  const { user } = useContext(AuthContext);
  const [events, setEvents] = useState([]);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentView, setCurrentView] = useState(Views.MONTH);
  const [currentDate, setCurrentDate] = useState(new Date());
  const navigate = useNavigate();

  const userId = user?.id;


  

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

      const formattedEvents = res.data.map((m) => ({
        id: m.id,
        title: m.title || "Untitled Meeting",
        start: new Date(m.startTime),
        end: new Date(m.endTime),
        host: m.host,
        roomId: m.roomId,
        description: m.description || "",
        status: new Date(m.endTime) < new Date() ? "past" : "upcoming",
      }));

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

  const formatDate = (date) => format(date, "PPpp");

  const copyRoomId = () => {
    if (!selectedMeeting) return;
    navigator.clipboard.writeText(selectedMeeting.roomId);
    alert("Room ID copied!");
  };

 const joinMeeting = (meeting) => {
  // Store meeting data in localStorage or sessionStorage
  sessionStorage.setItem('joiningMeeting', JSON.stringify({
    roomId: meeting.roomId,
    userName: user?.name || 'Participant',
    userEmail: user?.email || '',
    isHost: meeting.host === user?.email
  }));
  
  // Navigate to meeting
  navigate(`/meeting/${meeting.roomId}`);
};


  const eventStyleGetter = (event) => {
    const isPast = event.end < new Date();
    const isSelected = selectedMeeting?.id === event.id;
    
    const baseStyle = {
      borderRadius: "8px",
      border: "none",
      color: "white",
      fontWeight: 600,
      opacity: isPast ? 0.7 : 1,
    };

    if (isSelected) {
      return {
        style: {
          ...baseStyle,
          background: "linear-gradient(135deg, #caa8ff, #d6bcff)",
          boxShadow: "0px 0px 15px rgba(202, 168, 255, 0.8)",
        }
      };
    }

    if (isPast) {
      return {
        style: {
          ...baseStyle,
          background: "linear-gradient(135deg, #666, #888)",
          boxShadow: "0px 0px 8px rgba(150, 150, 150, 0.3)",
        }
      };
    }

    return {
      style: {
        ...baseStyle,
        background: "linear-gradient(135deg, #6e56cf, #a27dff)",
        boxShadow: "0px 0px 10px rgba(162, 125, 255, 0.5)",
      }
    };
  };

  return (
    <div className="scheduled-meetings-container">
      {/* Left side - Calendar */}
      <div className="calendar-section">
        <div className="calendar-header">
          <h2>Your Scheduled Meetings</h2>
          <div className="calendar-actions">
            <button
              onClick={() => setCurrentDate(new Date())}
              className="today-btn"
            >
              Today
            </button>
            <button
              onClick={() => navigate("/schedule")}
              className="schedule-btn"
            >
              + Schedule New
            </button>
          </div>
        </div>

        {loading && (
          <div className="loading">
            <div className="spinner"></div>
            <p>Loading your meetings...</p>
          </div>
        )}

        {error && <div className="error-banner">{error}</div>}

        {!loading && events.length === 0 && !error && (
          <div className="empty-state">
            <p>No meetings scheduled yet.</p>
            <button
              onClick={() => navigate("/schedule")}
              className="btn-primary"
            >
              Schedule Your First Meeting
            </button>
          </div>
        )}

        {!loading && (
          <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            style={{ height: "70vh", marginTop: 20 }}
            onSelectEvent={setSelectedMeeting}
            eventPropGetter={eventStyleGetter}
            dayPropGetter={(date) => ({
              style: {
                backgroundColor:
                  new Date().toDateString() === date.toDateString()
                    ? "rgba(110, 86, 207, 0.1)"
                    : undefined,
              },
            })}
            defaultView={Views.MONTH}
            view={currentView}
            onView={setCurrentView}
            date={currentDate}
            onNavigate={setCurrentDate}
            views={['month', 'week', 'day', 'agenda']}
            toolbar={true}
            popup={true}
            showMultiDayTimes={true}
            step={60}
            timeslots={1}
          />
        )}
      </div>

      {/* Right side - Split panel */}
      <div className="side-panel">
        {/* Top half - Recent Meetings */}
        <div className="panel-section recent-section">
          <div className="section-header">
            <h3>Recent Meetings</h3>
            <span className="section-count">{recentMeetings.length}</span>
          </div>
          
          <div className="section-content">
            {recentMeetings.length === 0 ? (
              <div className="empty-message">
                <div className="empty-icon">📅</div>
                <p>No recent meetings</p>
                <small>Your past meetings will appear here</small>
              </div>
            ) : (
              <div className="recent-list">
                {recentMeetings.map((m) => (
                  <div 
                    key={m.id} 
                    className={`recent-item ${selectedMeeting?.id === m.id ? 'selected' : ''}`}
                    onClick={() => setSelectedMeeting(m)}
                  >
                    <div className="recent-item-main">
                      <div className="recent-title">
                        <h4>{m.title}</h4>
                        <span className="past-badge">Past</span>
                      </div>
                      <p className="recent-host">Host: {m.host}</p>
                      <p className="recent-date">{format(m.end, "MMM dd, yyyy 'at' h:mm a")}</p>
                    </div>
                    <div className="recent-actions">
                      <button
                        className="view-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedMeeting(m);
                        }}
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Bottom half - Meeting Details */}
        <div className="panel-section details-section">
          <div className="section-header">
            <h3>Meeting Details</h3>
            {selectedMeeting && (
              <span className={`status-badge ${selectedMeeting.status}`}>
                {selectedMeeting.status}
              </span>
            )}
          </div>
          
          <div className="section-content">
            {!selectedMeeting ? (
              <div className="placeholder">
                <div className="placeholder-icon">👈</div>
                <p>Select a meeting to view details</p>
                <small>Click on any meeting from the calendar or recent meetings</small>
              </div>
            ) : (
              <div className="meeting-card">
                <div className="meeting-card-header">
                  <h4>{selectedMeeting.title}</h4>
                  <button
  onClick={() => joinMeeting(selectedMeeting)}
  className="join-btn-header"
>
  Join Meeting
</button>
                </div>

                <div className="details-grid">
                  <div className="detail-item">
                    <span className="detail-label">Host:</span>
                    <span className="detail-value">{selectedMeeting.host}</span>
                  </div>

                  <div className="detail-item">
                    <span className="detail-label">Room ID:</span>
                    <div className="room-id-container">
                      <code className="room-id">{selectedMeeting.roomId}</code>
                      <button onClick={copyRoomId} className="copy-btn">
                        📋 Copy
                      </button>
                    </div>
                  </div>

                  <div className="detail-item">
                    <span className="detail-label">Start Time:</span>
                    <span className="detail-value">{formatDate(selectedMeeting.start)}</span>
                  </div>

                  <div className="detail-item">
                    <span className="detail-label">End Time:</span>
                    <span className="detail-value">{formatDate(selectedMeeting.end)}</span>
                  </div>

                  {selectedMeeting.description && (
                    <div className="detail-item full-width">
                      <span className="detail-label">Description:</span>
                      <div className="description-box">
                        {selectedMeeting.description}
                      </div>
                    </div>
                  )}
                </div>

                <div className="meeting-actions-footer">
                 <button onClick={() => joinMeeting(selectedMeeting)} className="join-btn-full">
  Join Meeting Now
</button>
                  {/* {selectedMeeting.status === "past" && (
                    <button
                      className="replay-btn"
                      onClick={() => navigate(`/meeting/${selectedMeeting.roomId}?replay=true`)}
                    >
                      View Recording
                    </button>
                  )} */}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .scheduled-meetings-container {
          display: flex;
          height: 92vh;
          background: linear-gradient(135deg, #0f0f23 0%, #1a1a33 100%);
          color: #e0e0ff;
          font-family: 'Segoe UI', sans-serif;
        }

        /* Calendar Section */
        .calendar-section {
          flex: 1;
          padding: 2rem;
          overflow-y: auto;
        }

        .calendar-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .calendar-actions {
          display: flex;
          gap: 1rem;
        }

        .today-btn, .schedule-btn {
          padding: 0.5rem 1rem;
          border-radius: 6px;
          border: none;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .today-btn {
          background: #2a2a4a;
          color: #d6d6ff;
          border: 1px solid #3a3a5a;
        }

        .today-btn:hover {
          background: #3a3a6a;
        }

        .schedule-btn {
          background: linear-gradient(135deg, #6e56cf, #a27dff);
          color: white;
        }

        .schedule-btn:hover {
          background: linear-gradient(135deg, #7d65df, #b18dff);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(110, 86, 207, 0.3);
        }

        /* Side Panel - Split Layout */
        .side-panel {
          width: 450px;
          display: flex;
          flex-direction: column;
          border-left: 1px solid #333355;
          background: rgba(30, 30, 63, 0.9);
          backdrop-filter: blur(10px);
        }

        .panel-section {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0; /* Important for scrollable content */
        }

        .panel-section.recent-section {
          border-bottom: 1px solid #333355;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.5rem 1.5rem 0.5rem;
          border-bottom: 1px solid #333355;
        }

        .section-header h3 {
          margin: 0;
          font-size: 1.2rem;
          color: #b8b8ff;
        }

        .section-count {
          background: #6e56cf;
          color: white;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 0.8rem;
          font-weight: 600;
        }

        .section-content {
          flex: 1;
          overflow-y: auto;
          padding: 1rem 1.5rem;
        }

        /* Recent Meetings Styles */
        .empty-message {
          text-align: center;
          padding: 2rem 0;
          color: #7777aa;
        }

        .empty-icon {
          font-size: 2rem;
          margin-bottom: 1rem;
        }

        .empty-message p {
          margin: 0.5rem 0;
        }

        .empty-message small {
          font-size: 0.85rem;
          color: #666699;
        }

        .recent-list {
          display: flex;
          flex-direction: column;
          gap: 0.8rem;
        }

        .recent-item {
          background: rgba(42, 42, 74, 0.8);
          border-radius: 10px;
          border: 1px solid rgba(68, 68, 102, 0.5);
          padding: 1rem;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .recent-item:hover {
          border-color: #6e56cf;
          background: rgba(110, 86, 207, 0.1);
          transform: translateX(4px);
        }

        .recent-item.selected {
          border-color: #a27dff;
          background: rgba(162, 125, 255, 0.15);
          box-shadow: 0 0 0 1px #a27dff;
        }

        .recent-item-main {
          margin-bottom: 0.8rem;
        }

        .recent-title {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 0.5rem;
        }

        .recent-title h4 {
          margin: 0;
          font-size: 1rem;
          color: #e0e0ff;
          flex: 1;
        }

        .past-badge {
          background: rgba(158, 158, 158, 0.2);
          color: #9e9e9e;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 600;
          margin-left: 0.5rem;
        }

        .recent-host {
          font-size: 0.85rem;
          color: #bbb;
          margin: 0.3rem 0;
        }

        .recent-date {
          font-size: 0.8rem;
          color: #9999cc;
          margin: 0.3rem 0;
        }

        .recent-actions {
          display: flex;
          justify-content: flex-end;
        }

        .view-btn {
          background: #2a2a4a;
          color: #d6d6ff;
          border: 1px solid #3a3a5a;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .view-btn:hover {
          background: #3a3a6a;
        }

        /* Meeting Details Styles */
        .placeholder {
          text-align: center;
          padding: 2rem 0;
          color: #7777aa;
        }

        .placeholder-icon {
          font-size: 2rem;
          margin-bottom: 1rem;
        }

        .placeholder p {
          margin: 0.5rem 0;
        }

        .placeholder small {
          font-size: 0.85rem;
          color: #666699;
        }

        .status-badge {
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .status-badge.upcoming {
          background: rgba(76, 175, 80, 0.2);
          color: #4caf50;
          border: 1px solid #4caf50;
        }

        .status-badge.past {
          background: rgba(158, 158, 158, 0.2);
          color: #9e9e9e;
          border: 1px solid #9e9e9e;
        }

        .meeting-card {
          background: rgba(42, 42, 74, 0.9);
          border-radius: 12px;
          border: 2px solid #6e56cf;
          padding: 1.5rem;
          backdrop-filter: blur(10px);
        }

        .meeting-card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1.5rem;
        }

        .meeting-card-header h4 {
          margin: 0;
          font-size: 1.3rem;
          color: #e0e0ff;
          flex: 1;
        }

        .join-btn-header {
          background: linear-gradient(135deg, #6e56cf, #a27dff);
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          margin-left: 1rem;
        }

        .join-btn-header:hover {
          background: linear-gradient(135deg, #7d65df, #b18dff);
          transform: translateY(-1px);
        }

        .details-grid {
          display: grid;
          gap: 1rem;
        }

        .detail-item {
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }

        .detail-item.full-width {
          grid-column: 1 / -1;
        }

        .detail-label {
          font-size: 0.9rem;
          color: #b8b8ff;
          font-weight: 600;
        }

        .detail-value {
          font-size: 1rem;
          color: #e0e0ff;
        }

        .room-id-container {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .room-id {
          background: rgba(0, 0, 0, 0.3);
          padding: 0.5rem 0.8rem;
          border-radius: 6px;
          font-family: 'Courier New', monospace;
          font-size: 0.9rem;
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .copy-btn {
          background: #2a2a4a;
          color: #d6d6ff;
          border: 1px solid #3a3a5a;
          padding: 0.5rem 1rem;
          border-radius: 6px;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          gap: 0.3rem;
        }

        .copy-btn:hover {
          background: #3a3a6a;
        }

        .description-box {
          background: rgba(0, 0, 0, 0.2);
          padding: 1rem;
          border-radius: 8px;
          margin-top: 0.5rem;
          line-height: 1.6;
          color: #cfcfff;
        }

        .meeting-actions-footer {
          display: flex;
          flex-direction: column;
          gap: 0.8rem;
          margin-top: 1.5rem;
        }

        .join-btn-full {
          width: 100%;
          padding: 12px;
          background: linear-gradient(135deg, #6e56cf, #a27dff);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .join-btn-full:hover {
          background: linear-gradient(135deg, #7d65df, #b18dff);
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(110, 86, 207, 0.4);
        }

        .replay-btn {
          width: 100%;
          padding: 12px;
          background: rgba(158, 158, 158, 0.2);
          color: #e0e0ff;
          border: 1px solid #9e9e9e;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .replay-btn:hover {
          background: rgba(158, 158, 158, 0.3);
          border-color: #d6d6ff;
        }

        /* Loading and Error States */
        .loading {
          text-align: center;
          padding: 3rem;
        }

        .spinner {
          border: 3px solid rgba(110, 86, 207, 0.3);
          border-top: 3px solid #6e56cf;
          border-radius: 50%;
          width: 40px;
          height: 40px;
          animation: spin 1s linear infinite;
          margin: 0 auto 1rem;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .error-banner {
          background: rgba(244, 67, 54, 0.1);
          border: 1px solid #f44336;
          color: #ff8a80;
          padding: 1rem;
          border-radius: 8px;
          margin-bottom: 1rem;
        }

        .empty-state {
          text-align: center;
          padding: 3rem;
          background: rgba(42, 42, 74, 0.5);
          border-radius: 12px;
          margin-top: 1rem;
        }

        .btn-primary {
          background: linear-gradient(135deg, #6e56cf, #a27dff);
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          margin-top: 1rem;
          transition: all 0.3s ease;
        }

        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(110, 86, 207, 0.4);
        }
      `}</style>

      <style jsx global>{`
        /* Calendar Global Styles - Same as before */
        .rbc-calendar {
          background: #15152b !important;
          color: #e0e0ff !important;
          border-radius: 12px;
          border: 1px solid #2c2c4a;
          padding: 10px;
        }

        .rbc-toolbar {
          background: #1c1c37 !important;
          color: #d6d6ff !important;
          border-radius: 10px !important;
          padding: 10px 15px !important;
          border: 1px solid #2f2f4f !important;
          margin-bottom: 15px !important;
        }

        .rbc-toolbar button {
          background: #2a2a4a !important;
          color: #d6d6ff !important;
          border-radius: 6px !important;
          border: 1px solid #3a3a5a !important;
          font-weight: 600 !important;
          padding: 6px 12px !important;
          transition: all 0.3s ease !important;
        }

        .rbc-toolbar button:hover {
          background: #6e56cf !important;
          color: white !important;
          transform: translateY(-1px) !important;
        }

        .rbc-toolbar button.rbc-active {
          background: linear-gradient(135deg, #6e56cf, #a27dff) !important;
          color: white !important;
          border-color: #6e56cf !important;
          box-shadow: 0 2px 8px rgba(110, 86, 207, 0.3) !important;
        }

        .rbc-header {
          background: #1e1e3f !important;
          color: #b8b8ff !important;
          border-bottom: 1px solid #2e2e4f !important;
          padding: 12px 0 !important;
          font-weight: 600 !important;
        }

        .rbc-today {
          background: rgba(110, 86, 207, 0.15) !important;
          border: 1px solid rgba(162, 125, 255, 0.3) !important;
        }

        .rbc-time-content {
          background: #1a1a33 !important;
        }

        .rbc-time-slot {
          color: #9999cc !important;
          border-color: #2c2c4a !important;
        }

        .rbc-timeslot-group {
          border-color: #2e2e4f !important;
        }

        .rbc-month-view {
          border: none !important;
        }

        .rbc-month-row {
          border-color: #2e2e4f !important;
        }

        .rbc-date-cell {
          color: #cfcfff !important;
          padding: 1px !important;
        }

        .rbc-date-cell button {
          color: #cfcfff !important;
        }

        .rbc-date-cell.rbc-now button {
          color: #6e56cf !important;
          font-weight: bold !important;
        }

        .rbc-off-range-bg {
          background: rgba(255, 255, 255, 0.05) !important;
        }

        .rbc-off-range {
          color: #7777aa !important;
        }

        .rbc-event {
          transition: all 0.3s ease !important;
          overflow: hidden !important;
        }

        .rbc-event:hover {
          transform: scale(1.03) !important;
          box-shadow: 0px 0px 14px rgba(162, 125, 255, 0.85) !important;
        }

        .rbc-selected {
          background: linear-gradient(135deg, #a27dff, #caa8ff) !important;
          box-shadow: 0px 0px 15px rgba(202, 168, 255, 0.8) !important;
        }

        /* Scrollbar */
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        ::-webkit-scrollbar-thumb {
          background: linear-gradient(135deg, #6e56cf, #a27dff);
          border-radius: 10px;
        }
        ::-webkit-scrollbar-track {
          background: #1a1a33;
        }
      `}</style>
    </div>
  );
}

export default ScheduledMeetings;