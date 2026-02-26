import React from "react";
import format from "date-fns/format";

function RecentMeetings({ recentMeetings, selectedMeeting, onSelectMeeting }) {
  return (
    <>
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
            {recentMeetings.map((meeting) => (
              <RecentMeetingItem
                key={meeting.id}
                meeting={meeting}
                isSelected={selectedMeeting?.id === meeting.id}
                onSelectMeeting={onSelectMeeting}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function RecentMeetingItem({ meeting, isSelected, onSelectMeeting }) {
  return (
    <div 
      className={`recent-item ${isSelected ? 'selected' : ''}`}
      onClick={() => onSelectMeeting(meeting)}
    >
      <div className="recent-item-main">
        <div className="recent-title">
          <h4>{meeting.title}</h4>
          <span className="past-badge">Past</span>
        </div>
        <p className="recent-host">Host: {meeting.host}</p>
        <p className="recent-date">{format(meeting.end, "MMM dd, yyyy 'at' h:mm a")}</p>
      </div>
      <div className="recent-actions">
        <button
          className="view-btn"
          onClick={(e) => {
            e.stopPropagation();
            onSelectMeeting(meeting);
          }}
        >
          View Details
        </button>
      </div>
    </div>
  );
}

export default RecentMeetings;