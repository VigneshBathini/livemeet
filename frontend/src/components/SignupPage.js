import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from './AuthContext';

const SignupPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    console.log('Attempting signup with:', { email, password, name });
    try {
      const response = await axios.post('https://livemeet-ribm.onrender.com/api/signup', { email, password, name });
      console.log('Signup response:', response.data);
      login(response.data.user, response.data.token);
      navigate('/video');
    } catch (err) {
      console.error('Signup error:', err.response?.data, err.message);
      setError(err.response?.data?.error || 'Failed to sign up');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signup-page min-h-screen flex flex-col items-center justify-center py-6 overflow-auto">
      <div className="form-container">
        <h2>Sign Up</h2>
        <div className="space-y-4">
          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              required
            />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>
          {error && <div className="error">{error}</div>}
          <button onClick={handleSignup} disabled={loading}>
            {loading ? 'Signing up...' : 'Sign Up'}
          </button>
          <div className="text-center">
            <p className="text-sm">
              Already have an account?{' '}
              <a href="/login" className="text-blue-400 hover:underline">
                Log In
              </a>
            </p>
          </div>
        </div>
      </div>
      <style>
        {`
          .signup-page {
            background: #16213e;
            color: #e0e0e0;
          }
          .form-container {
            padding: 24px;
            background: #16213e;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.4);
            width: 100%;
            max-width: 500px;
          }
          .signup-page h2 {
            font-size: 22px;
            font-weight: 600;
            margin-bottom: 20px;
            text-align: center;
          }
          .form-group {
            display: flex;
            align-items: center;
            margin-bottom: 16px;
            gap: 16px;
          }
          .form-group label {
            flex: 0 0 100px;
            font-size: 14px;
            text-align: right;
          }
          .form-group input {
            flex: 1;
            padding: 12px;
            border: 1px solid #2e2e4b;
            border-radius: 6px;
            font-size: 14px;
            background: #24244a;
            color: #e0e0e0;
          }
          .form-group input:focus {
            border-color: #00b7eb;
            outline: none;
          }
          .error {
            margin: 8px 0 0 116px;
            font-size: 13px;
            color: #ff4d4d;
          }
          button {
            margin-left: 116px;
            width: calc(100% - 116px);
            padding: 12px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            color: #e0e0e0;
            background: linear-gradient(135deg, #00b7eb, #6b48ff);
            transition: opacity 0.2s;
          }
          button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }
          button:hover:not(:disabled) {
            opacity: 0.9;
          }
          .text-center {
            margin-top: 12px;
            font-size: 13px;
          }
          .text-blue-400 {
            color: #00b7eb;
          }
          @media (max-width: 640px) {
            .form-container {
              padding: 16px;
              max-width: 100%;
            }
            .signup-page h2 {
              font-size: 18px;
              margin-bottom: 16px;
            }
            .form-group {
              flex-direction: column;
              align-items: flex-start;
              gap: 6px;
              margin-bottom: 12px;
            }
            .form-group label {
              flex: none;
              text-align: left;
              font-size: 12px;
            }
            .form-group input {
              width: 100%;
              padding: 8px;
              font-size: 12px;
            }
            .error {
              margin: 6px 0 0 0;
              font-size: 11px;
            }
            button {
              margin-left: 0;
              width: 100%;
              padding: 10px;
              font-size: 12px;
            }
            .text-center {
              font-size: 11px;
            }
          }
        `}
      </style>
    </div>
  );
};

export default SignupPage;