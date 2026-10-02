document.addEventListener('DOMContentLoaded', () => {
  const roomIdInput = document.getElementById('roomId');
  const passcodeInput = document.getElementById('passcode');
  const contentInput = document.getElementById('content');
  const sendBtn = document.getElementById('sendBtn');
  const statusEl = document.getElementById('status');

  // Load saved roomId
  chrome.storage.local.get(['roomId'], (res) => {
    if (res.roomId) roomIdInput.value = res.roomId;
  });

  sendBtn.addEventListener('click', async () => {
    const roomId = roomIdInput.value.trim();
    const passcode = passcodeInput.value.trim();
    const content = contentInput.value.trim();

    if (!roomId || !content) {
      statusEl.textContent = 'Room ID and Content are required.';
      statusEl.className = 'status error';
      return;
    }

    sendBtn.disabled = true;
    statusEl.textContent = 'Sending...';
    statusEl.className = 'status';

    // Save roomId for next time
    chrome.storage.local.set({ roomId });

    try {
      const baseUrl = 'https://tdr.app'; // Replace with your prod URL
      const res = await fetch(`${baseUrl}/api/cli`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, passcode: passcode || undefined, content })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to send');
      }

      statusEl.textContent = 'Success!';
      statusEl.className = 'status success';
      contentInput.value = ''; // clear
    } catch (e) {
      statusEl.textContent = e.message;
      statusEl.className = 'status error';
    } finally {
      sendBtn.disabled = false;
    }
  });
});
