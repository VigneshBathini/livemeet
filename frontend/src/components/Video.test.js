import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Video from './Video';
import { AuthContext } from './AuthContext';

const mockNavigate = jest.fn();
const mockSocket = {
  id: 'socket-1',
  on: jest.fn(),
  off: jest.fn(),
  emit: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
  connected: true,
};

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useParams: () => ({}),
}));

jest.mock('socket.io-client', () => jest.fn(() => mockSocket));
jest.mock('simple-peer', () =>
  jest.fn(() => ({
    on: jest.fn(),
    signal: jest.fn(),
    destroy: jest.fn(),
    _pc: {
      getSenders: jest.fn(() => []),
    },
  })),
);
jest.mock('axios', () => ({ post: jest.fn(), get: jest.fn() }));

jest.mock('face-api.js', () => ({
  nets: {
    ssdMobilenetv1: { loadFromUri: jest.fn(() => Promise.resolve()) },
    faceLandmark68Net: { loadFromUri: jest.fn(() => Promise.resolve()) },
  },
}));

jest.mock('./VideoControls', () => () => <div data-testid="video-controls" />);
jest.mock('./ChatPanel', () => () => <div data-testid="chat-panel" />);
jest.mock('./MeetingHeader', () => () => <div data-testid="meeting-header" />);
jest.mock('./VideoLayout', () => () => <div data-testid="video-layout" />);
jest.mock('./DebugPanel', () => () => <div data-testid="debug-panel" />);
jest.mock('./lobby/WaitingLobby', () => () => <div data-testid="waiting-lobby" />);
jest.mock('./lobby/LobbyPanel', () => () => <div data-testid="lobby-panel" />);
jest.mock('./notifications/ConferenceNotification', () => () => (
  <div data-testid="conference-notification" />
));
jest.mock('./SchedulePage', () => () => <div data-testid="schedule-page" />);
jest.mock('./JoinRoom', () => () => <div>Join Room UI</div>);

const renderVideo = (authValue, props = {}) =>
  render(
    <MemoryRouter>
      <AuthContext.Provider value={authValue}>
        <Video {...props} />
      </AuthContext.Provider>
    </MemoryRouter>,
  );

describe('Video', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders join room view by default for authenticated internal user', () => {
    renderVideo({
      user: { id: 1, name: 'Test User', email: 'test@example.com' },
      logout: jest.fn(),
    });

    expect(screen.getByText('Join Room UI')).toBeInTheDocument();
  });

  test('redirects to login for unauthenticated internal user', async () => {
    renderVideo({ user: null, logout: jest.fn() }, { isExternal: false });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });
  });

  test('does not redirect external user to login', async () => {
    renderVideo({ user: null, logout: jest.fn() }, { isExternal: true });

    await waitFor(() => {
      expect(screen.getByText('Join Room UI')).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalledWith('/login');
  });

  test('initializes socket connection', async () => {
    const io = require('socket.io-client');
    renderVideo({
      user: { id: 1, name: 'Test User', email: 'test@example.com' },
      logout: jest.fn(),
    });

    await waitFor(() => {
      expect(io).toHaveBeenCalledWith(
        'http://localhost:3000',
        expect.objectContaining({
          transports: ['websocket', 'polling'],
          reconnection: true,
        }),
      );
      expect(mockSocket.connect).toHaveBeenCalled();
    });
  });

  test('loads face api models on mount', async () => {
    renderVideo({
      user: { id: 1, name: 'Test User', email: 'test@example.com' },
      logout: jest.fn(),
    });

    const faceapi = require('face-api.js');
    await waitFor(() => {
      expect(faceapi.nets.ssdMobilenetv1.loadFromUri).toHaveBeenCalledWith('/weights');
      expect(faceapi.nets.faceLandmark68Net.loadFromUri).toHaveBeenCalledWith('/weights');
    });
  });
});
