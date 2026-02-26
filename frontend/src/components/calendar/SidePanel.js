import React from "react";
import RecentMeetings from "./RecentMeetings";
import MeetingDetails from "./MeetingDetails";

function SidePanel({
  recentMeetings,
  selectedMeeting,
  onSelectMeeting,
  onJoinMeeting,
  user
}) {
  return (
    <div className="side-panel">
      {/* <div className="panel-section recent-section">
        <RecentMeetings
          recentMeetings={recentMeetings}
          selectedMeeting={selectedMeeting}
          onSelectMeeting={onSelectMeeting}
        />
      </div> */}
      
      <div className="panel-section details-section">
        <MeetingDetails
          selectedMeeting={selectedMeeting}
          onJoinMeeting={onJoinMeeting}
          user={user}
        />
      </div>
    </div>
  );
}

export default SidePanel;