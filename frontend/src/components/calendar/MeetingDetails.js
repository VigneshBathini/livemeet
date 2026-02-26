import React from "react";
import format from "date-fns/format";
import { useNavigate } from "react-router-dom";

function MeetingDetails({ selectedMeeting, onJoinMeeting, user }) {
  const navigate = useNavigate();
  
  const formatDate = (date) => format(date, "PPpp");
  
  const copyRoomId = () => {
    if (!selectedMeeting) return;
    navigator.clipboard.writeText(selectedMeeting.roomId);
    alert("Room ID copied!");
  };

  if (!selectedMeeting) {
    return (
      <>
        <div className="section-header">
          <h3>Meeting Details</h3>
        </div>
        
        <div className="section-content">
          <div className="placeholder">
            <div className="placeholder-icon">👈</div>
            <p>Select a meeting to view details</p>
            <small>Click on any meeting from the calendar or recent meetings</small>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="section-header">
        <h3>Meeting Details</h3>
        <span className={`status-badge ${selectedMeeting.status}`}>
          {selectedMeeting.status}
        </span>
      </div>
      
      <div className="section-content">
        <div className="meeting-card">
          <MeetingCardHeader 
            title={selectedMeeting.title}
            onJoinMeeting={() => onJoinMeeting(selectedMeeting)}
          />
          
          <DetailsGrid 
            meeting={selectedMeeting}
            formatDate={formatDate}
            onCopyRoomId={copyRoomId}
          />
          
          <MeetingActionsFooter 
            onJoinMeeting={() => onJoinMeeting(selectedMeeting)}
            isPast={selectedMeeting.status === "past"}
            roomId={selectedMeeting.roomId}
          />
        </div>
      </div>
    </>
  );
}

function MeetingCardHeader({ title, onJoinMeeting }) {
  return (
    <div className="meeting-card-header">
      <h4>{title}</h4>
      <button onClick={onJoinMeeting} className="join-btn-header">
        Join Meeting
      </button>
    </div>
  );
}

function DetailsGrid({ meeting, formatDate, onCopyRoomId }) {
  return (
    <div className="details-grid">
      <DetailItem label="Host:" value={meeting.host} />
      
      <div className="detail-item">
        <span className="detail-label">Room ID:</span>
        <div className="room-id-container">
          <code className="room-id">{meeting.roomId}</code>
          <button onClick={onCopyRoomId} className="copy-btn">
            📋 Copy
          </button>
        </div>
      </div>

      <DetailItem label="Start Time:" value={formatDate(meeting.start)} />
      <DetailItem label="End Time:" value={formatDate(meeting.end)} />

      {meeting.description && (
        <div className="detail-item full-width">
          <span className="detail-label">Description:</span>
          <div className="description-box">
            {meeting.description}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailItem({ label, value }) {
  return (
    <div className="detail-item">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value}</span>
    </div>
  );
}

function MeetingActionsFooter({ onJoinMeeting, isPast, roomId }) {
  const navigate = useNavigate();
  
  return (
    <div className="meeting-actions-footer">
      <button onClick={onJoinMeeting} className="join-btn-full">
        Join Meeting Now
      </button>
      {/* {isPast && (
        <button
          className="replay-btn"
          onClick={() => navigate(`/meeting/${roomId}?replay=true`)}
        >
          View Recording
        </button>
      )} */}
    </div>
  );
}

export default MeetingDetails;