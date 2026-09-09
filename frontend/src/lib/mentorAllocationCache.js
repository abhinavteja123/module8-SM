const key = 'mentor-allocation-preload';

export function cacheMentorAllocations(userId, data) {
  sessionStorage.setItem(key, JSON.stringify({ userId, data }));
}

export function readMentorAllocations(userId) {
  try {
    const cached = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    return cached?.userId === userId ? cached.data : undefined;
  } catch {
    return undefined;
  }
}

export function clearMentorAllocations() {
  sessionStorage.removeItem(key);
}
