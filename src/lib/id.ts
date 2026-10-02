export function generateRoomId(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  let id = ''
  for (let i = 0; i < 16; i++) {
    id += alphabet[array[i] % alphabet.length]
  }
  return id
}
