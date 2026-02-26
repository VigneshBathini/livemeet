import React from 'react';
import { render } from '@testing-library/react';

jest.mock('./components/Video', () => () => <div>Video Mock</div>);
jest.mock('./components/LoginPage', () => () => <div>Login Mock</div>);
jest.mock('./components/JoinMeetingPage', () => () => <div>JoinMeeting Mock</div>);
jest.mock('./components/SchedulePage', () => () => <div>Schedule Mock</div>);
jest.mock('./components/SignupPage', () => () => <div>Signup Mock</div>);
jest.mock('./components/ScheduledMeetings', () => () => <div>ScheduledMeetings Mock</div>);
jest.mock('./components/LandingPage', () => () => <div>Landing Mock</div>);

import App from './App';

test('renders app router without crashing', () => {
  render(<App />);
});
