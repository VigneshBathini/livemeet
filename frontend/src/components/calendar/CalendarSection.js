import React, { useState, useCallback, useRef, useEffect } from "react";
import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import format from "date-fns/format";
import parse from "date-fns/parse";
import startOfWeek from "date-fns/startOfWeek";
import getDay from "date-fns/getDay";
import enUS from "date-fns/locale/en-US";
import addHours from "date-fns/addHours";
import isSameDay from "date-fns/isSameDay";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "./styles/CalendarSection.css"; // We'll create this file

const locales = { "en-US": enUS };

// const CustomToolbar = ({ label, onNavigate }) => {
//   return (
//     <div className="calendar-toolbar-compact">
//       <button
//         className="nav-icon"
//         onClick={() => onNavigate("PREV")}
//         aria-label="Previous"
//       >
//         ‹
//       </button>

//       <span className="toolbar-label">{label}</span>

//       <button
//         className="nav-icon"
//         onClick={() => onNavigate("NEXT")}
//         aria-label="Next"
//       >
//         ›
//       </button>
//     </div>
//   );
// };


const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

function CalendarSection({
  events,
  loading,
  error,
  selectedMeeting,
  onSelectMeeting,
  onSelectDate,
  onNavigateToSchedule
}) {
  const [currentView, setCurrentView] = useState(Views.MONTH);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [lastSelectedSlot, setLastSelectedSlot] = useState(null);
  const calendarRef = useRef(null);


  

  // Process events to ensure they have proper Date objects
  const processedEvents = React.useMemo(() => {
    if (!events || !Array.isArray(events)) return [];

    return events.map(event => {
      // Safely parse dates
      const start = event.start instanceof Date
        ? event.start
        : new Date(event.start || event.startTime || Date.now());

      const end = event.end instanceof Date
        ? event.end
        : new Date(event.end || event.endTime || addHours(start, 1));

      // Ensure end is after start
      const safeEnd = end > start ? end : addHours(start, 1);

      return {
        ...event,
        id: event.id || event._id || Math.random().toString(36).substr(2, 9),
        title: event.title || event.meetingTitle || "Untitled Meeting",
        start,
        end: safeEnd,
        allDay: event.allDay || false,
        resource: event
      };
    }).filter(event => {
      // Filter out invalid events
      return event.start instanceof Date &&
        event.end instanceof Date &&
        !isNaN(event.start.getTime()) &&
        !isNaN(event.end.getTime());
    });
  }, [events]);

  // Event style getter with improved styling
  const eventStyleGetter = useCallback((event) => {
    const now = new Date();
    const isPast = event.end < now;
    const isCurrent = event.start <= now && event.end >= now;
    const isSelected = selectedMeeting?.id === event.id;

    const baseStyle = {
      borderRadius: "6px",
      border: "none",
      color: "white",
      opacity: 1,
      fontSize: "10.5px",
      padding: "1px 5px",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    };

    if (isSelected) {
      return {
        style: {
          ...baseStyle,
          background: "linear-gradient(135deg, #8a63d2, #c6a2ff)",
          boxShadow: "0 2px 8px rgba(138, 99, 210, 0.6)",
          border: "2px solid #c6a2ff",
          fontWeight: "bold",
          zIndex: 1000,
        }
      };
    }

    if (isCurrent) {
      return {
        style: {
          ...baseStyle,
          background: "linear-gradient(135deg, #00b7eb, #6b48ff)",
          boxShadow: "0 2px 8px rgba(0, 183, 235, 0.4)",
          borderLeft: "3px solid #00cc69",
          fontWeight: "600",
        }
      };
    }

    if (isPast) {
      return {
        style: {
          ...baseStyle,
          background: "linear-gradient(135deg, #5a5a6e, #8888a0)",
          boxShadow: "0 1px 4px rgba(0, 0, 0, 0.2)",
          opacity: 0.7,
        }
      };
    }

    // Future events
    return {
      style: {
        ...baseStyle,
        background: "linear-gradient(135deg, #6b48ff, #8a63d2)",
        boxShadow: "0 2px 6px rgba(107, 72, 255, 0.3)",
        borderLeft: "3px solid #00b7eb",
      }
    };
  }, [selectedMeeting]);

  // Handle slot selection with debouncing
  const handleSelectSlot = useCallback((slotInfo) => {
    const { start, end, action, slots } = slotInfo;

    // Prevent multiple rapid clicks
    if (lastSelectedSlot &&
      Date.now() - lastSelectedSlot.timestamp < 300 &&
      isSameDay(start, lastSelectedSlot.date)) {
      return;
    }

    setLastSelectedSlot({ timestamp: Date.now(), date: start });

    // Handle different actions
    if (action === 'click') {
      // Single click - select date for scheduling
      onSelectDate(start);
    } else if (action === 'select' && slots && slots.length === 1) {
      // Single slot selection (might be from drag)
      onSelectDate(start);
    } else if (action === 'select' && slots && slots.length > 1) {
      // Multiple slots selected - use the first one
      onSelectDate(slots[0]);
    }
  }, [onSelectDate, lastSelectedSlot]);

  // Handle event selection
  const handleSelectEvent = useCallback((event) => {
    if (event.resource) {
      onSelectMeeting(event.resource);
    } else {
      onSelectMeeting(event);
    }
  }, [onSelectMeeting]);

const CustomToolbar = ({ label, onNavigate, onView, view }) => {
  return (
    <div className="calendar-toolbar">
      
      {/* LEFT: view buttons */}
      <div className="toolbar-left">
        <button
          className={view === 'month' ? 'active' : ''}
          onClick={() => onView('month')}
        >
          Month
        </button>
        <button
          className={view === 'week' ? 'active' : ''}
          onClick={() => onView('week')}
        >
          Week
        </button>
        <button
          className={view === 'day' ? 'active' : ''}
          onClick={() => onView('day')}
        >
          Day
        </button>
      </div>

      {/* CENTER: arrows + label */}
      <div className="toolbar-center">
        <button
          className="nav-icon"
          onClick={() => onNavigate('PREV')}
        >
          ‹
        </button>

        <span className="toolbar-label">{label}</span>

        <button
          className="nav-icon"
          onClick={() => onNavigate('NEXT')}
        >
          ›
        </button>
      </div>

      {/* RIGHT: Today */}
      <div className="toolbar-right">
        <button onClick={() => onNavigate('TODAY')}>
          Today
        </button>
      </div>

    </div>
  );
};



  // Custom day cell
  const DayCellWrapper = useCallback(({ value, children }) => {
    const isToday = isSameDay(value, new Date());

    return (
      <div
        className={`day-cell ${isToday ? 'today' : ''}`}
        onClick={(e) => {
          // Only trigger if clicking on the cell background, not an event
          if (!e.target.closest('.rbc-event') && !e.target.closest('.rbc-addons-dnd')) {
            onSelectDate(value);
          }
        }}
      >
        {children}
      </div>
    );
  }, [onSelectDate]);

  // Custom event wrapper
  const EventWrapper = useCallback(({ event, children }) => {
    return (
      <div
        className="event-wrapper"
        title={`${event.title}\n${format(event.start, 'PPpp')} - ${format(event.end, 'pp')}`}
      >
        {children}
      </div>
    );
  }, []);

  // Render only title inside event content (especially for week/day time grid).
  const CalendarEvent = useCallback(({ event }) => {
    return <span className="calendar-event-title">{event.title}</span>;
  }, []);

  // Handle today button click
  const handleTodayClick = () => {
    setCurrentDate(new Date());
    // Also select today's date for scheduling
    onSelectDate(new Date());
  };

  // Handle schedule button click
  const handleScheduleClick = () => {
    onNavigateToSchedule?.() || onSelectDate(new Date());
  };

  // Reset last selected slot after 500ms
  useEffect(() => {
    if (lastSelectedSlot) {
      const timer = setTimeout(() => {
        setLastSelectedSlot(null);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [lastSelectedSlot]);

  return (
    <div className="calendar-section">
      <div className="calendar-header">
        <div className="header-left">
          <h2>Meeting Calendar</h2>
          <div className="calendar-stats">
            <span className="stat-item">
              <span className="stat-badge upcoming"></span>
              Upcoming: {processedEvents.filter(e => e.start > new Date()).length}
            </span>
            <span className="stat-item">
              <span className="stat-badge today"></span>
              Today: {processedEvents.filter(e => isSameDay(e.start, new Date())).length}
            </span>
            <span className="stat-item">
              <span className="stat-badge past"></span>
              Past: {processedEvents.filter(e => e.end < new Date()).length}
            </span>
          </div>
        </div>
        <div className="calendar-actions">
          <button
            onClick={handleTodayClick}
            className="btn-secondary today-btn"
            disabled={loading}
          >
            <span className="btn-icon">📅</span> Today
          </button>
          <button
            onClick={handleScheduleClick}
            className="btn-primary schedule-btn"
            disabled={loading}
          >
            <span className="btn-icon">+</span> Schedule New
          </button>
        </div>
      </div>

      {loading && (
        <div className="loading-overlay">
          <div className="spinner"></div>
          <p>Loading calendar data...</p>
        </div>
      )}

      {error && (
        <div className="error-banner">
          <span className="error-icon">⚠</span>
          <span className="error-message">{error}</span>
          <button
            className="retry-btn"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      )}

      {!loading && processedEvents.length === 0 && !error && (
        <div className="empty-state">
          <div className="empty-illustration">📅</div>
          <h3>No meetings scheduled</h3>
          <p>Schedule your first meeting to see it appear here</p>
          <button
            onClick={handleScheduleClick}
            className="btn-primary"
            disabled={loading}
          >
            Schedule Your First Meeting
          </button>
        </div>
      )}

      {!loading && processedEvents.length > 0 && (
        <div className="calendar-container" ref={calendarRef}>
          <Calendar
            localizer={localizer}
            events={processedEvents}
            startAccessor="start"
            endAccessor="end"
            style={{ height: "100%" }}
            onSelectEvent={handleSelectEvent}
            onSelectSlot={handleSelectSlot}
            eventPropGetter={eventStyleGetter}
            selectable={true}
            defaultView={Views.MONTH}
            view={currentView}
            onView={setCurrentView}
            date={currentDate}
            onNavigate={setCurrentDate}
            views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
            popup
            drilldownView={Views.DAY}
            dayLayoutAlgorithm="overlap"
            showMultiDayTimes
            step={30}
            timeslots={2}
            min={new Date(0, 0, 0, 8)}
            max={new Date(0, 0, 0, 22)}
            components={{
               toolbar: CustomToolbar,
               event: CalendarEvent
              // toolbar: CustomToolbar,
              // dayWrapper: DayCellWrapper,
              // eventWrapper: EventWrapper
            }}
            formats={{
              dateFormat: 'd',
              dayFormat: (date, culture, localizer) =>
                localizer.format(date, 'EEE d', culture),
              dayRangeHeaderFormat: ({ start, end }, culture, localizer) =>
                `${localizer.format(start, 'MMM d', culture)} - ${localizer.format(end, 'MMM d', culture)}`,
              eventTimeRangeFormat: ({ start, end }, culture, localizer) =>
                `${localizer.format(start, 'h:mm a', culture)} - ${localizer.format(end, 'h:mm a', culture)}`,
            }}
          />
        </div>
      )}

      {/* Selected meeting tooltip */}
      {/* {selectedMeeting && (
        <div className="selected-meeting-tooltip">
          <div className="tooltip-header">
            <h4>{selectedMeeting.title || selectedMeeting.meetingTitle}</h4>
            <button 
              className="close-tooltip"
              onClick={() => onSelectMeeting(null)}
            >
              ×
            </button>
          </div>
          <div className="tooltip-details">
            <p>
              <strong>Time:</strong>{" "}
              {format(new Date(selectedMeeting.start || selectedMeeting.startTime), 'PPpp')}
            </p>
            <p>
              <strong>Duration:</strong>{" "}
              {selectedMeeting.duration ? `${selectedMeeting.duration} minutes` : 'N/A'}
            </p>
            <p>
              <strong>Invitees:</strong>{" "}
              {Array.isArray(selectedMeeting.invitees) 
                ? selectedMeeting.invitees.length 
                : (selectedMeeting.invitees || '').split(',').length}
            </p>
          </div>
        </div>
      )} */}
    </div>
  );
}

export default CalendarSection;
