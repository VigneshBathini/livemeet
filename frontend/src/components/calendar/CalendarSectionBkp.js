import React, { useState } from "react";
import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import format from "date-fns/format";
import parse from "date-fns/parse";
import startOfWeek from "date-fns/startOfWeek";
import getDay from "date-fns/getDay";
import enUS from "date-fns/locale/en-US";
import "react-big-calendar/lib/css/react-big-calendar.css";

const locales = { "en-US": enUS };

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
  onNavigateToSchedule,
  onSelectDate // Add this new prop
}) {
  const [currentView, setCurrentView] = useState(Views.MONTH);
  const [currentDate, setCurrentDate] = useState(new Date());

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

  // Handle slot selection (click on empty date)
  const handleSelectSlot = (slotInfo) => {
    const { start, end, action } = slotInfo;
    
    // Only handle clicks (not drag selections)
    if (action === 'click' || action === 'select') {
      // Call the callback with selected date
      onSelectDate(start);
    }
  };

  // Custom day cell wrapper
  const DayCellWrapper = ({ children, value }) => {
    return (
      <div 
        className="day-cell-wrapper"
        onClick={(e) => {
          // Don't trigger if clicking on an event
          if (!e.target.closest('.rbc-event')) {
            onSelectDate(value);
          }
        }}
        style={{
          cursor: 'pointer',
          height: '100%',
          position: 'relative'
        }}
      >
        {children}
      </div>
    );
  };

  return (
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
            onClick={() => onSelectDate(new Date())} // Pass current date
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
            onClick={() => onSelectDate(new Date())}
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
          onSelectEvent={onSelectMeeting}
          onSelectSlot={handleSelectSlot}
          eventPropGetter={eventStyleGetter}
          dayPropGetter={(date) => ({
            style: {
              backgroundColor:
                new Date().toDateString() === date.toDateString()
                  ? "rgba(110, 86, 207, 0.1)"
                  : undefined,
              cursor: 'pointer',
            },
          })}
          selectable={true} // Enable slot selection
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
          // components={{
          //   dateCellWrapper: DayCellWrapper // Optional custom wrapper
          // }}
        />
      )}
    </div>
  );
}

export default CalendarSection;


/// enhanced
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

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});


const CustomAgenda = ({ date, events, length,onSelectMeeting }) => {
  // Group events by date
  const groupedEvents = React.useMemo(() => {
    const groups = {};
    events.forEach(event => { 
      const dateKey = format(event.start, 'EEE MMM dd');
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(event);
    });
    return groups;
  }, [events]);

  return (
    <div className="custom-agenda-view">
      <div className="agenda-header">
        <h3>Agenda View</h3>
        <p className="agenda-subtitle">
          Showing {events.length} meeting{events.length !== 1 ? 's' : ''}
        </p>
      </div>

      {Object.entries(groupedEvents).map(([dateKey, dateEvents]) => (
        <div key={dateKey} className="agenda-day-group">
          <div className="agenda-date-header">
            <span className="agenda-date">{dateKey}</span>
            <span className="agenda-date-count">
              {dateEvents.length} meeting{dateEvents.length !== 1 ? 's' : ''}
            </span>
          </div>
          
          <div className="agenda-events">
            {dateEvents.map((event, index) => (
              <div 
                key={event.id || index} 
                className="agenda-event"
                onClick={() => onSelectMeeting?.(event.resource || event)}
              >
                <div className="agenda-event-time">
                  <span className="time-icon">🕒</span>
                  {format(event.start, 'h:mm a')} - {format(event.end, 'h:mm a')}
                </div>
                <div className="agenda-event-content">
                  <div className="agenda-event-title">
                    {event.title}
                    {event.resource?.meetingType && (
                      <span className={`agenda-event-type ${event.resource.meetingType}`}>
                        {event.resource.meetingType}
                      </span>
                    )}
                  </div>
                  {event.resource?.creatorName && (
                    <div className="agenda-event-host">
                      <span className="host-icon">👤</span>
                      Host: {event.resource.creatorName}
                    </div>
                  )}
                  {event.resource?.invitees && (
                    <div className="agenda-event-attendees">
                      <span className="attendees-icon">👥</span>
                      {Array.isArray(event.resource.invitees) 
                        ? `${event.resource.invitees.length} attendee${event.resource.invitees.length !== 1 ? 's' : ''}`
                        : `${event.resource.invitees.split(',').length} attendee${event.resource.invitees.split(',').length !== 1 ? 's' : ''}`
                      }
                    </div>
                  )}
                </div>
                <div className="agenda-event-status">
                  {event.end < new Date() ? (
                    <span className="status-badge completed">Completed</span>
                  ) : event.start <= new Date() && event.end >= new Date() ? (
                    <span className="status-badge in-progress">Live</span>
                  ) : (
                    <span className="status-badge upcoming">Upcoming</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {events.length === 0 && (
        <div className="agenda-empty">
          <div className="empty-icon">📅</div>
          <p>No meetings scheduled in this period</p>
        </div>
      )}
    </div>
  );
};


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

  const components = React.useMemo(() => ({
    // toolbar: CustomToolbar,
    // dayWrapper: DayCellWrapper,
    // eventWrapper: EventWrapper,
    agenda: {
      event: CustomAgenda, // You can also create a CustomAgendaEvent if needed
    }
  }), []);

  const messages = React.useMemo(() => ({
    showMore: total => `+${total} more`,
    agenda: 'Agenda',
    previous: 'Back',
    next: 'Next',
    today: 'Today',
    month: 'Month',
    week: 'Week',
    day: 'Day',
    date: 'Date',
    time: 'Time',
    event: 'Event',
    noEventsInRange: 'No meetings in this period',
  }), []);

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
      fontSize: "12px",
      padding: "2px 6px",
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

  // Custom toolbar component
  const CustomToolbar = useCallback(({ label, onNavigate, onView }) => {
    return (
      <div className="rbc-toolbar">
        <span className="rbc-btn-group">
          <button type="button" onClick={() => onNavigate('TODAY')}>
            Today
          </button>
          <button type="button" onClick={() => onNavigate('PREV')}>
            ‹
          </button>
          <button type="button" onClick={() => onNavigate('NEXT')}>
            ›
          </button>
        </span>
        <span className="rbc-toolbar-label">{label}</span>
        <span className="rbc-btn-group">
          <button 
            type="button" 
            className={currentView === Views.MONTH ? 'rbc-active' : ''}
            onClick={() => onView(Views.MONTH)}
          >
            Month
          </button>
          <button 
            type="button" 
            className={currentView === Views.WEEK ? 'rbc-active' : ''}
            onClick={() => onView(Views.WEEK)}
          >
            Week
          </button>
          <button 
            type="button" 
            className={currentView === Views.DAY ? 'rbc-active' : ''}
            onClick={() => onView(Views.DAY)}
          >
            Day
          </button>
          <button 
            type="button" 
            className={currentView === Views.AGENDA ? 'rbc-active' : ''}
            onClick={() => onView(Views.AGENDA)}
          >
            Agenda
          </button>
        </span>
      </div>
    );
  }, [currentView]);

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

       {!loading && processedEvents.length > 0 && currentView === Views.AGENDA && (
        <div className="calendar-agenda-view">
          <CustomAgenda
            date={currentDate}
            events={processedEvents}
            onSelectMeeting={onSelectMeeting}
          />
        </div>
      )}

      {!loading && processedEvents.length > 0 && currentView !== Views.AGENDA && (
        <div className="calendar-container" ref={calendarRef}>
          <Calendar
            localizer={localizer}
            events={processedEvents}
            startAccessor="start"
            endAccessor="end"
            style={{ height: "calc(70vh - 60px)" }}
            onSelectEvent={handleSelectEvent}
            onSelectSlot={handleSelectSlot}
            eventPropGetter={eventStyleGetter}
            selectable={true}
            defaultView={Views.MONTH}
            view={currentView}
            onView={setCurrentView}
            date={currentDate}
            onNavigate={setCurrentDate}
            views={{ 
              month: true, 
              week: true, 
              day: true, 
              agenda: CustomAgenda // Use custom agenda component
            }}
            popup={true}
            showMultiDayTimes={true}
            step={60}
            timeslots={1}
            min={new Date(0, 0, 0, 8, 0, 0)}
            max={new Date(0, 0, 0, 22, 0, 0)}
            dayLayoutAlgorithm="no-overlap"
            components={components}
            messages={messages}
            formats={{
              agendaDateFormat: 'EEE MMM dd',
              agendaTimeFormat: 'h:mm a',
              agendaTimeRangeFormat: ({ start, end }, culture, localizer) =>
                `${localizer.format(start, 'h:mm a', culture)} - ${localizer.format(end, 'h:mm a', culture)}`,
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