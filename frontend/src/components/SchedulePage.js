import React, { useState, useEffect, useContext, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { AuthContext } from './AuthContext';
import debounce from 'lodash/debounce';
import '../styles/SchedulePage.css';

const API_URL = "http://localhost:3000";

const SchedulePage = ({ onScheduleComplete = () => {}, onBack = () => {} }) => {
  const { user, token } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();

  // Get prefill data from navigation state or sessionStorage
  const getPrefillDateTime = () => {
    if (location.state?.prefillDateTime) {
      return new Date(location.state.prefillDateTime);
    }
    
    const stored = sessionStorage.getItem('schedulePrefill');
    if (stored) {
      try {
        const data = JSON.parse(stored);
        return new Date(data.selectedDateTime);
      } catch (e) {
        console.error('Error parsing stored date:', e);
      }
    }
    
    return new Date();
  };

  // Get default start time
  const getDefaultStartTime = () => {
    if (location.state?.selectedTime) {
      return location.state.selectedTime;
    }
    
    const now = new Date();
    const minutes = now.getMinutes();
    const roundedMinutes = Math.ceil(minutes / 30) * 30;
    now.setMinutes(roundedMinutes);
    now.setSeconds(0);
    
    const hours = now.getHours().toString().padStart(2, '0');
    const mins = now.getMinutes().toString().padStart(2, '0');
    return `${hours}:${mins}`;
  };

  // Get default end time
  const getDefaultEndTime = (startTime) => {
    const [hours, minutes] = startTime.split(':').map(Number);
    const startDate = new Date();
    startDate.setHours(hours, minutes, 0, 0);
    
    // Add 30 minutes by default
    const endDate = new Date(startDate.getTime() + 30 * 60000);
    
    const endHours = endDate.getHours().toString().padStart(2, '0');
    const endMinutes = endDate.getMinutes().toString().padStart(2, '0');
    return `${endHours}:${endMinutes}`;
  };

  // Duration options
  const durationOptions = [
    { value: '15', label: '15 minutes' },
    { value: '30', label: '30 minutes' },
    { value: '45', label: '45 minutes' },
    { value: '60', label: '1 hour' },
    { value: '90', label: '1.5 hours' },
    { value: '120', label: '2 hours' },
    { value: '180', label: '3 hours' },
    { value: '240', label: '4 hours' },
    { value: 'custom', label: 'Custom' },
  ];

  const [formData, setFormData] = useState({
    meetingTitle: '',
    creatorName: user?.name || '',
    creatorEmail: user?.email || '',
    creatorId: user?.id || '',
    scheduledDate: getPrefillDateTime(),
    startTime: getDefaultStartTime(),
    endTime: '',
    duration: '30', // Default duration in minutes
    customDuration: '60', // Default custom duration
    showCustomDuration: false,
    invitees: '',
    description: '',
    meetingType: 'regular',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [scheduledLink, setScheduledLink] = useState('');

  const [inviteeSuggestions, setInviteeSuggestions] = useState([]);
  const [inviteeValidation, setInviteeValidation] = useState({});
  const [loadingInvitees, setLoadingInvitees] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [currentEmail, setCurrentEmail] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);


  // Initialize end time based on start time
  useEffect(() => {
    const defaultEndTime = getDefaultEndTime(formData.startTime);
    setFormData(prev => ({
      ...prev,
      endTime: defaultEndTime
    }));
  }, []);

  // Calculate end time based on start time and duration
  const calculateEndTime = (startTime, durationMinutes) => {
    const [hours, minutes] = startTime.split(':').map(Number);
    const startDate = new Date();
    startDate.setHours(hours, minutes, 0, 0);
    
    const endDate = new Date(startDate.getTime() + durationMinutes * 60000);
    
    const endHours = endDate.getHours().toString().padStart(2, '0');
    const endMinutes = endDate.getMinutes().toString().padStart(2, '0');
    return `${endHours}:${endMinutes}`;
  };

  // Update end time when start time changes
  const handleStartTimeChange = (time) => {
    const durationMinutes = formData.duration === 'custom' 
      ? parseInt(formData.customDuration) || 30 
      : parseInt(formData.duration) || 30;
    
    const endTime = calculateEndTime(time, durationMinutes);
    
    setFormData(prev => ({
      ...prev,
      startTime: time,
      endTime: endTime
    }));
  };

  // Handle duration selection from dropdown
  const handleDurationChange = (selectedDuration) => {
    const showCustom = selectedDuration === 'custom';
    const durationMinutes = showCustom 
      ? parseInt(formData.customDuration) || 30 
      : parseInt(selectedDuration) || 30;
    
    const endTime = calculateEndTime(formData.startTime, durationMinutes);
    
    setFormData(prev => ({
      ...prev,
      duration: selectedDuration,
      showCustomDuration: showCustom,
      endTime: endTime
    }));
  };

  // Handle custom duration input change
  const handleCustomDurationChange = (customDuration) => {
    const durationMinutes = parseInt(customDuration) || 30;
    const endTime = calculateEndTime(formData.startTime, durationMinutes);
    
    setFormData(prev => ({
      ...prev,
      customDuration: customDuration,
      endTime: endTime
    }));
  };

  // Handle manual end time change
  const handleEndTimeChange = (time) => {
    // Calculate duration from start and end times
    const [startHour, startMinute] = formData.startTime.split(':').map(Number);
    const [endHour, endMinute] = time.split(':').map(Number);
    
    const startTotalMinutes = startHour * 60 + startMinute;
    const endTotalMinutes = endHour * 60 + endMinute;
    const calculatedDuration = endTotalMinutes - startTotalMinutes;
    
    // Find the closest preset duration
    let closestDuration = 'custom';
    let closestMatch = null;
    let minDiff = Infinity;
    
    durationOptions.forEach(option => {
      if (option.value !== 'custom') {
        const presetDuration = parseInt(option.value);
        const diff = Math.abs(presetDuration - calculatedDuration);
        if (diff < minDiff && diff <= 5) { // Within 5 minutes tolerance
          minDiff = diff;
          closestDuration = option.value;
          closestMatch = presetDuration;
        }
      }
    });
    
    // Update form data
    setFormData(prev => ({
      ...prev,
      endTime: time,
      duration: closestDuration,
      showCustomDuration: closestDuration === 'custom',
      customDuration: closestDuration === 'custom' ? calculatedDuration.toString() : prev.customDuration
    }));
  };

  // Validate time logic
  const validateTimes = () => {
    const [startHour, startMinute] = formData.startTime.split(':').map(Number);
    const [endHour, endMinute] = formData.endTime.split(':').map(Number);
    
    const startTotalMinutes = startHour * 60 + startMinute;
    const endTotalMinutes = endHour * 60 + endMinute;
    
    if (endTotalMinutes <= startTotalMinutes) {
      setError('End time must be after start time');
      return false;
    }
    
    const durationMinutes = endTotalMinutes - startTotalMinutes;
    if (durationMinutes < 15) {
      setError('Meeting duration must be at least 15 minutes');
      return false;
    }
    
    if (durationMinutes > 480) { // 8 hours
      setError('Meeting duration cannot exceed 8 hours');
      return false;
    }
    
    return true;
  };

  useEffect(() => {
    if (!user) {
      navigate('/login');
    } else {
      setFormData((prev) => ({
        ...prev,
        creatorName: user.name,
        creatorEmail: user.email,
        creatorId: user.id,
      }));
    }

    return () => {
      sessionStorage.removeItem('schedulePrefill');
    };
  }, [user, navigate]);

  // Update form when location state changes
  useEffect(() => {
    if (location.state?.prefillDateTime) {
      const newDate = new Date(location.state.prefillDateTime);
      const startTime = location.state.selectedTime || getDefaultStartTime();
      const endTime = getDefaultEndTime(startTime);
      
      setFormData(prev => ({
        ...prev,
        scheduledDate: newDate,
        startTime: startTime,
        endTime: endTime
      }));
    }
  }, [location.state]);

  // Function to validate email format
  const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Function to check if user exists in database
  const checkUserExists = async (query) => {
    console.log('Searching users for:', query);

    // If query is empty or too short, clear suggestions
    if (!query || query.length < 3) {
      setInviteeSuggestions([]);
      return;
    }

    try {
      const response = await axios.get(
        `${API_URL}/api/users/search`, // Changed endpoint to search
        {
          params: { q: query },
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      console.log('API response:', response.data);

      const users = response.data.users || []; // Changed to response.data.users
      setInviteeSuggestions(users);

      // ✅ UPDATE VALIDATION STATE
      const validationMap = {};
      users.forEach(user => {
        validationMap[user.email] = {
          exists: true,
          name: user.name,
          error: null
        };
      });

      setInviteeValidation(prev => ({
        ...prev,
        ...validationMap
      }));

    } catch (err) {
      console.error('Error searching users:', err);
      setInviteeSuggestions([]);
    }
  };

  // Debounced version of checkUserExists
  const validateIndividualEmail = async (email) => {
    if (!isValidEmail(email)) {
      return { 
        exists: false, 
        name: null, 
        error: 'Invalid email format' 
      };
    }

    try {
      const response = await axios.get(
        `${API_URL}/api/users/check/${encodeURIComponent(email)}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      return {
        exists: response.data.exists,
        name: response.data.name,
        error: response.data.exists ? null : 'User not registered'
      };
    } catch (err) {
      return { 
        exists: false, 
        name: null, 
        error: 'Error checking user' 
      };
    }
  };

  // Update the debounced function to also validate individual emails
  const debouncedCheckUser = useCallback(
    debounce(async (email) => {
      console.log('Debounced check triggered for:', email);
      
      if (!email || email.length < 3) {
        setInviteeSuggestions([]);
        return;
      }

      // If it looks like a complete email, validate it
      if (isValidEmail(email)) {
        const validation = await validateIndividualEmail(email);
        setInviteeValidation(prev => ({
          ...prev,
          [email]: validation
        }));
        
        // Only show as suggestion if user exists
        if (validation.exists) {
          setInviteeSuggestions([{
            email: email,
            name: validation.name
          }]);
        } else {
          setInviteeSuggestions([]);
        }
      } else {
        // If it's a partial search, use search endpoint
        checkUserExists(email);
      }
    }, 500),
    [token]
  );

  // Update handleInviteesChange to handle email validation better
  const handleInviteesChange = (e) => {
    const value = e.target.value;
    setFormData({ ...formData, invitees: value });
    
    // Extract all emails
    const emails = value.split(',').map(email => email.trim()).filter(email => email);
    const lastEmail = emails[emails.length - 1] || '';
    
    setCurrentEmail(lastEmail);
    
    if (lastEmail) {
      setShowSuggestions(true);
      
      // Validate all complete emails as user types
      emails.forEach(async (email) => {
        if (email && isValidEmail(email) && !inviteeValidation[email]) {
          // Only validate if not already validated
          const validation = await validateIndividualEmail(email);
          setInviteeValidation(prev => ({
            ...prev,
            [email]: validation
          }));
        }
      });
      
      debouncedCheckUser(lastEmail);
    } else {
      setShowSuggestions(false);
      setInviteeSuggestions([]);
    }
  };

  // Add this useEffect to clear validation when emails are removed
  useEffect(() => {
    const emails = formData.invitees
      .split(',')
      .map(email => email.trim())
      .filter(email => email);
    
    // Remove validation for emails that are no longer in the list
    setInviteeValidation(prev => {
      const newValidation = { ...prev };
      Object.keys(newValidation).forEach(email => {
        if (!emails.includes(email)) {
          delete newValidation[email];
        }
      });
      return newValidation;
    });
  }, [formData.invitees]);

  // Handle email selection from suggestions
const handleEmailSelect = (email, name) => {
  const input = document.querySelector('.invitees-input');

  const emails = formData.invitees
    .split(',')
    .map(e => e.trim());

  // Replace last typed part
  emails[emails.length - 1] = email;

  const newInvitees = emails.filter(Boolean).join(', ') + ', ';

  setFormData(prev => ({
    ...prev,
    invitees: newInvitees
  }));

  setShowSuggestions(false);
  setCurrentEmail('');
  setHighlightedIndex(0);

  // 👇 Keep focus + move cursor to end
  requestAnimationFrame(() => {
    if (input) {
      input.focus();
      input.setSelectionRange(newInvitees.length, newInvitees.length);
    }
  });
};


  // Validate all invitees when form is submitted
  const validateInvitees = async (inviteeList) => {
    setLoadingInvitees(true);
    
    // Check each email
    const validationPromises = inviteeList.map(async (email) => {
      if (!isValidEmail(email)) {
        return { email, valid: false, error: 'Invalid email format' };
      }
      
      try {
        const response = await axios.get(`${API_URL}/api/users/check/${encodeURIComponent(email)}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        return { 
          email, 
          valid: response.data.exists, 
          name: response.data.name,
          error: response.data.exists ? null : 'User not registered'
        };
      } catch (err) {
        return { email, valid: false, error: 'Error checking user' };
      }
    });
    
    const results = await Promise.all(validationPromises);
    setLoadingInvitees(false);
    
    // Check if all are valid
    const invalidEmails = results.filter(r => !r.valid);
    if (invalidEmails.length > 0) {
      setError(`Invalid invitees: ${invalidEmails.map(e => e.email).join(', ')}`);
      return false;
    }
    
    return true;
  };

  const validate = () => {
    if (
      !formData.meetingTitle.trim() ||
      !formData.creatorName.trim() ||
      !formData.creatorEmail.trim() ||
      !formData.startTime.trim() ||
      !formData.endTime.trim() ||
      !formData.invitees.trim() ||
      !formData.creatorId
    ) {
      setError('Please fill in all required fields.');
      return false;
    }

    if (!validateTimes()) {
      return false;
    }

    // Validate custom duration if selected
    if (formData.duration === 'custom') {
      const customDuration = parseInt(formData.customDuration);
      if (isNaN(customDuration) || customDuration < 15 || customDuration > 480) {
        setError('Custom duration must be between 15 and 480 minutes');
        return false;
      }
    }

    // Validate invitee emails
    const inviteeList = formData.invitees
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);

    const invalid = inviteeList.some((email) => !/^\S+@\S+\.\S+$/.test(email));
    if (invalid) {
      setError('One or more invitee emails look invalid.');
      return false;
    }

    return true;
  };

  const getISTDateString = (dateObj) => {
    return dateObj.toLocaleDateString('en-CA'); // YYYY-MM-DD
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setScheduledLink('');

    if (!validate()) return;

    setLoading(true);

    const inviteeList = formData.invitees
      .split(',')
      .map(p => p.trim())
      .filter(Boolean);

    // ✅ IST-safe date (NO toISOString)
    const scheduledDate = getISTDateString(formData.scheduledDate);

    // Duration calculation
    const [sh, sm] = formData.startTime.split(':').map(Number);
    const [eh, em] = formData.endTime.split(':').map(Number);
    const duration = (eh * 60 + em) - (sh * 60 + sm);

    const payload = {
      meetingTitle: formData.meetingTitle,
      creatorId: formData.creatorId,
      creatorName: formData.creatorName,
      creatorEmail: formData.creatorEmail,
      scheduledDate,            // IST date
      startTime: formData.startTime, // IST time
      endTime: formData.endTime,     // IST time
      duration,
      invitees: inviteeList,
      description: formData.description,
      meetingType: formData.meetingType,
    };

    console.log('Payload (IST):', payload);

    try {
      const res = await axios.post(`${API_URL}/api/schedule`, payload);
      setScheduledLink(res.data.link);
      setSuccessMsg('Meeting scheduled successfully!');
      
      // Navigate to scheduled meetings after success
      setTimeout(() => {
        navigate('/scheduled-meetings');
      }, 2000);
      
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to schedule meeting');
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    if (!scheduledLink) return;
    try {
      await navigator.clipboard.writeText(scheduledLink);
      setSuccessMsg('Link copied to clipboard.');
      setTimeout(() => setSuccessMsg(''), 2500);
    } catch {
      setError('Unable to copy link to clipboard.');
    }
  };

  // Calculate meeting duration in minutes
  const calculateDuration = () => {
    const [startHour, startMinute] = formData.startTime.split(':').map(Number);
    const [endHour, endMinute] = formData.endTime.split(':').map(Number);
    
    const startTotalMinutes = startHour * 60 + startMinute;
    const endTotalMinutes = endHour * 60 + endMinute;
    
    return endTotalMinutes - startTotalMinutes;
  };

  // Handle cancel/back button for modal
 const handleCancel = () => {
    navigate(-1); // Go back in history
  };


  return (
    <div className="schedule-page-modal">
      <div className="modal-header">
        <h2>Schedule a Meeting</h2>
        <button className="modal-close-btn" onClick={handleCancel}>
          ×
        </button>
      </div>
      
      <div className="modal-content-scrollable">
        <div className="time-info">
          <span className="current-time">
            Current time: {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          {formData.startTime && formData.endTime && (
            <span className="meeting-duration">
              Duration: {calculateDuration()} minutes
            </span>
          )}
        </div>

       <form
  className="schedule-form"
  onSubmit={handleSubmit}
  noValidate
  onKeyDown={(e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
      e.preventDefault();
      e.target.blur(); // 👈 this is the "OK" behavior
    }
  }}
>

          <div className="form-grid">
            <div className="form-row full">
              <label>Meeting Title *</label>
              <input
                type="text"
                value={formData.meetingTitle}
                onChange={(e) => setFormData({ ...formData, meetingTitle: e.target.value })}
                placeholder="Enter meeting title"
                aria-label="Meeting Title"
                required
                maxLength={100}
              />
            </div>

            <div className="form-row half">
              <label>Your Name *</label>
              <input
                type="text"
                value={formData.creatorName}
                onChange={(e) => setFormData({ ...formData, creatorName: e.target.value })}
                placeholder="Enter your name"
                aria-label="Your Name"
                required
                 maxLength={100}
              />
            </div>

            <div className="form-row half">
              <label>Your Email *</label>
              <input
                type="email"
                value={formData.creatorEmail}
                disabled
                placeholder="Enter your email"
                aria-label="Your Email"
                 maxLength={100}
              />
            </div>

            <div className="form-row half">
              <label>Date *</label>
              <DatePicker
                selected={formData.scheduledDate}
                onChange={(date) => setFormData({ ...formData, scheduledDate: date })}
                minDate={new Date()}
                dateFormat="yyyy-MM-dd"
                aria-label="Meeting Date"
                className="date-picker-input"
              />
            </div>

            <div className="form-row half">
              <label>Duration</label>
              <select
                value={formData.duration}
                onChange={(e) => handleDurationChange(e.target.value)}
                aria-label="Meeting Duration"
              >
                {durationOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-row half">
              <label>Start Time *</label>
              <input
                type="time"
                value={formData.startTime}
                onChange={(e) => handleStartTimeChange(e.target.value)}
                aria-label="Start Time"
                step="300" // 5 minute intervals
                required
              />
            </div>

            <div className="form-row half">
              <label>End Time *</label>
              <input
                type="time"
                value={formData.endTime}
                onChange={(e) => handleEndTimeChange(e.target.value)}
                aria-label="End Time"
                step="300" // 5 minute intervals
                required
              />
              <div className="time-note">
                {calculateDuration() > 0 ? (
                  <span className="valid">✓ {calculateDuration()} minutes</span>
                ) : (
                  <span className="invalid">⚠ End time must be after start</span>
                )}
              </div>
            </div>

            {formData.showCustomDuration && (
              <div className="form-row half custom-duration-row">
                <label>Custom Duration (minutes) *</label>
                <input
                  type="number"
                  value={formData.customDuration}
                  onChange={(e) => handleCustomDurationChange(e.target.value)}
                  min="15"
                  max="480"
                  step="15"
                  placeholder="Enter minutes"
                  required={formData.duration === 'custom'}
                />
                <div className="custom-duration-hint">
                  Enter duration between 15-480 minutes
                </div>
              </div>
            )}

            <div className="form-row full">
              <label>Invitees (comma-separated emails) *</label>
              <div className="invitees-container">
                <input
  type="text"
  value={formData.invitees}
  onChange={(e) => {
    handleInviteesChange(e);
    setHighlightedIndex(0);
  }}
  placeholder="email1@example.com, email2@example.com"
  className="invitees-input"
  required
  onKeyDown={(e) => {
    if (e.key === 'Enter') {
      e.preventDefault();

      if (showSuggestions && inviteeSuggestions.length > 0) {
        const selected = inviteeSuggestions[highlightedIndex];
        handleEmailSelect(selected.email, selected.name);
      } else {
        e.currentTarget.blur(); // OK behavior
      }
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((i) =>
        Math.min(i + 1, inviteeSuggestions.length - 1)
      );
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    }
  }}
  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
  onFocus={() => {
    if (currentEmail) setShowSuggestions(true);
  }}
/>


                
                {showSuggestions && inviteeSuggestions.length > 0 && (
  <div className="suggestions-dropdown">
    {inviteeSuggestions.map((suggestion, index) => (
      <div
        key={index}
        className={`suggestion-item ${
          index === highlightedIndex ? 'active' : ''
        }`}
        onMouseDown={(e) => {
          e.preventDefault();
          handleEmailSelect(suggestion.email, suggestion.name);
        }}
      >
        <div className="suggestion-email">{suggestion.email}</div>
        <div className="suggestion-name">({suggestion.name})</div>
      </div>
    ))}
  </div>
)}


                
                {/* Display validation status for each email */}
                <div className="invitee-validation-list">
                  {formData.invitees
                    .split(',')
                    .map((email) => email.trim())
                    .filter((email) => email) // Remove empty strings
                    .map((email, index) => {
                      const validation = inviteeValidation[email];
                      return (
                        <div key={index} className="invitee-tag">
                          <span className="invitee-email">{email}</span>
                          {validation?.exists === true && validation?.name && (
                            <span className="invitee-name">
                              ({validation.name})
                            </span>
                          )}
                          {validation?.exists === false && (
                            <span className="invitee-error">
                              ⚠ {validation.error || 'User not found'}
                            </span>
                          )}
                          {validation === undefined && isValidEmail(email) && (
                            <span className="invitee-checking">
                              <span className="checking-spinner"></span>
                            </span>
                          )}
                          {validation === undefined && !isValidEmail(email) && email.length > 10 && (
                            <span className="invitee-error">
                              ⚠ Invalid email format
                            </span>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
              
              <div className="invitee-hint">
                Type email and press comma or select from suggestions
              </div>
            </div>

            <div className="form-row full">
              <label>Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter meeting description"
                aria-label="Meeting Description"
                 maxLength={200}
              />
            </div>

            <div className="form-row half">
              <label>Meeting Type</label>
              <select
                value={formData.meetingType}
                onChange={(e) => setFormData({ ...formData, meetingType: e.target.value })}
                aria-label="Meeting Type"
              >
                <option value="regular">Regular</option>
                <option value="proctor">Proctor</option>
              </select>
            </div>

            <div className="form-row half">
              <label>Meeting Summary</label>
              <div className="summary-box">
                <p><strong>Date:</strong> {formData.scheduledDate.toDateString()}</p>
                <p><strong>Time:</strong> {formData.startTime} - {formData.endTime}</p>
                <p><strong>Duration:</strong> {calculateDuration()} minutes</p>
                {formData.duration === 'custom' && (
                  <p><strong>Custom Duration:</strong> {formData.customDuration} minutes</p>
                )}
              </div>
            </div>

            {error && (
              <div className="form-row full feedback error-row">
                <span className="error-icon">⚠</span>
                <span className="msg">{error}</span>
              </div>
            )}

            {successMsg && (
              <div className="form-row full feedback success-row">
                <span className="success-icon">✓</span>
                <span className="msg">{successMsg}</span>
              </div>
            )}

            {scheduledLink && (
              <div className="form-row full link-row">
                <label>Scheduled Link</label>
                <div className="link-box">
                  <input type="text" readOnly value={scheduledLink} />
                  <button type="button" className="btn-copy" onClick={copyLink}>
                    Copy
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="form-actions">
            <button type="button" className="btn-ghost" onClick={handleCancel} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-primary btn-gradient" disabled={loading}>
              {loading ? 'Scheduling...' : 'Schedule Meeting'}
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        .schedule-page-modal {
          background: #0d1020;
          border-radius: 20px;
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        
        .modal-header {
          padding: 20px 24px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: rgba(255, 255, 255, 0.02);
        }
        
        .modal-header h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
          color: #e9eef8;
        }
        
        .modal-close-btn {
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: #e9eef8;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .modal-close-btn:hover {
          background: rgba(255, 255, 255, 0.2);
          transform: scale(1.1);
        }
        
        .modal-content-scrollable {
          flex: 1;
          overflow-y: auto;
          padding: 20px 24px;
        }
        
        .time-info {
          display: flex;
          justify-content: space-between;
          margin-bottom: 20px;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.7);
        }
        
        .schedule-form {
          height: 100%;
        }
        
        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 20px;
        }
        
        .form-row {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        
        .form-row.full {
          grid-column: 1 / -1;
        }
        
        .form-row.half {
          grid-column: span 1;
        }
        
        label {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.7);
          font-weight: 500;
        }
        
        input, select, textarea {
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(6, 8, 14, 0.45);
          color: #e9eef8;
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s;
        }
        
        input:focus, select:focus, textarea:focus {
          border-color: rgba(78, 167, 255, 0.6);
        }
        
        .date-picker-input {
          width: 100%;
        }
        
        .time-note {
          font-size: 11px;
          margin-top: 4px;
        }
        
        .time-note .valid {
          color: #00cc69;
        }
        
        .time-note .invalid {
          color: #ff6b6b;
        }
        
        .custom-duration-hint {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
          margin-top: 4px;
        }
        
        .invitees-container {
          position: relative;
        }
        
        .invitees-input {
          width: 100%;
        }
        
        .suggestions-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: rgba(13, 16, 32, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          z-index: 100;
          max-height: 200px;
          overflow-y: auto;
          margin-top: 4px;
        }
        
        .suggestion-item {
          padding: 8px 12px;
          cursor: pointer;
          transition: background 0.2s;
        }
        
        .suggestion-item:hover {
          background: rgba(255, 255, 255, 0.05);
        }
        
        .suggestion-email {
          font-size: 13px;
          color: #e9eef8;
        }
        
        .suggestion-name {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
        }
        
        .invitee-validation-list {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 8px;
        }
        
        .invitee-tag {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          padding: 4px 8px;
          font-size: 11px;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        
        .invitee-email {
          color: #e9eef8;
        }
        
        .invitee-name {
          color: rgba(255, 255, 255, 0.6);
        }
        
        .invitee-error {
          color: #ff6b6b;
        }
        
        .invitee-checking {
          color: rgba(255, 255, 255, 0.4);
        }
        
        .checking-spinner {
          display: inline-block;
          width: 8px;
          height: 8px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: rgba(78, 167, 255, 1);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        .invitee-hint {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
          margin-top: 4px;
        }
        
        textarea {
          min-height: 80px;
          resize: vertical;
        }
        
        .summary-box {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          padding: 12px;
          font-size: 12px;
        }
        
        .summary-box p {
          margin: 4px 0;
          color: rgba(255, 255, 255, 0.7);
        }
        
        .summary-box strong {
          color: #e9eef8;
        }
        
        .feedback {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          border-radius: 8px;
        }
        
        .error-row {
          background: rgba(255, 107, 107, 0.1);
          border: 1px solid rgba(255, 107, 107, 0.2);
        }
        
        .success-row {
          background: rgba(0, 204, 105, 0.1);
          border: 1px solid rgba(0, 204, 105, 0.2);
        }
        
        .error-icon, .success-icon {
          font-size: 16px;
        }
        
        .error-icon {
          color: #ff6b6b;
        }
        
        .success-icon {
          color: #00cc69;
        }
        
        .msg {
          flex: 1;
          font-size: 13px;
        }
        
        .link-row label {
          margin-bottom: 8px;
        }
        
        .link-box {
          display: flex;
          gap: 8px;
        }
        
        .link-box input {
          flex: 1;
          background: rgba(255, 255, 255, 0.05);
        }
        
        .btn-copy {
          padding: 10px 16px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          color: #e9eef8;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .btn-copy:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        
        .form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          padding-top: 20px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .btn-ghost {
          padding: 10px 20px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: #e9eef8;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .btn-ghost:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.1);
        }
        
        .btn-primary {
          padding: 10px 20px;
          background: linear-gradient(90deg, #4ea7ff, #7c56ff);
          border: none;
          border-radius: 8px;
          color: white;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .btn-primary:hover:not(:disabled) {
          opacity: 0.9;
          transform: translateY(-1px);
        }
        
        .btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        
        /* Responsive */
        @media (max-width: 768px) {
          .form-grid {
            grid-template-columns: 1fr;
          }
          
          .form-row.half {
            grid-column: 1 / -1;
          }
          
          .modal-header {
            padding: 16px;
          }
          
          .modal-content-scrollable {
            padding: 16px;
          }
        }
      `}</style>
    </div>
  );
};

export default SchedulePage;