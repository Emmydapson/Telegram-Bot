import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  telegramId: {
    type: String,
    required: true,
    unique: true,
  },
  points: {
    type: Number,
    default: 0,
  },
  lastSpin: {
    type: Date,
    default: null,
  },
  referralCode: {
    type: String,
    unique: true,
  },
  referredBy: {
    type: String,
    default: null,
  },
  spinStreak: {
    type: Number,
    default: 0,
  },
  lastSpinDate: {
    type: Date,
    default: null,
  },  
  isBanned: {
    type: Boolean,
    default: false,
  },
  

  
});

const User = mongoose.model('User', userSchema);

export default User;
