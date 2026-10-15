import { createToken } from './access.js'

const token = await createToken()

console.log('已生成新的访问令牌，并保存到 data/access.json（已在 .gitignore 中排除）')
console.log('')
console.log(`令牌：${token}`)
console.log('')
console.log(`本机链接：http://127.0.0.1:3001/?token=${token}`)
console.log('穿透地址把同样的 ?token=… 后缀接在公网域名后面即可。')
