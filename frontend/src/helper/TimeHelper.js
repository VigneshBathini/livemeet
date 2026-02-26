import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { format } from 'date-fns';

const IST_TIMEZONE = 'Asia/Kolkata';

class TimeHelper {
  // UTC → IST
  static toIST(utcDate) {
    if (!utcDate) return null;
    const date = utcDate instanceof Date ? utcDate : new Date(utcDate);
    return toZonedTime(date, IST_TIMEZONE);
  }

  // IST → UTC
  static toUTC(localDate) {
    if (!localDate) return null;
    const date = localDate instanceof Date ? localDate : new Date(localDate);
    return fromZonedTime(date, IST_TIMEZONE);
  }

  // Generic IST formatter
  static formatIST(date, formatStr = 'PPpp') {
    const istDate = this.toIST(date);
    return istDate ? format(istDate, formatStr) : 'N/A';
  }

  // ✔ Used by MeetingDetails
  static getDateIST(date) {
    return this.formatIST(date, 'PPP');
  }

  // ✔ Used by MeetingDetails
  static getTimeIST(date) {
    return this.formatIST(date, 'hh:mm a');
  }
}

export default TimeHelper;
