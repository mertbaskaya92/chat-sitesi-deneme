const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config();
const geoip = require('geoip-lite');
const countryList = require('country-list');
const helmet = require('helmet');

const app = express();
const server = http.createServer(app);

// Güvenlik için Helmet middleware'ini kullan.
// Bu, socket.io'nun, emoji resimlerinin ve inline stillerin çalışmasına izin veren
// özel bir Content Security Policy (CSP) içerir.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "default-src": ["'self'"], // Varsayılan olarak sadece kendi kaynağından gelenlere izin ver
      "script-src-elem": ["'self'", "blob:", "https://cdn.jsdelivr.net/npm/emoji-picker-element@^1/index.js.gz"],
      "connect-src": [
        "'self'",
        "https://chat-sitesi-deneme-backend.onrender.com",
        "wss://chat-sitesi-deneme-backend.onrender.com",
        "https://chat-sitesi-deneme.vercel.app",
        "wss://chat-sitesi-deneme.vercel.app",
        "https://www.google-analytics.com",
        "https://overbridgenet.com"
      ],
      "img-src": ["'self'", "data:", "https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/"],
      "style-src": ["'self'", "'unsafe-inline'"]
    }
  }
}));

const io = socketIo(server, {
  cors: {
    origin: ["http://localhost:3000", "https://chat-sitesi-deneme.vercel.app"],
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Sunucunun canlı olduğunu kontrol etmek için kök route
app.get('/', (req, res) => {
  res.status(200).send('Server is alive and running!');
});

// Kullanıcı yönetimi
const waitingUsers = new Set();
const activeConnections = new Map();
const usersData = new Map(); // Kullanıcıların ülke bilgilerini saklamak için

// Anlık kullanıcı sayısını tüm istemcilere yayınlayan fonksiyon
const updateAndBroadcastUserCount = () => {
  const userCount = io.sockets.sockets.size;
  console.log(`Anlık kullanıcı sayısı: ${userCount}`);
  io.emit('updateUserCount', userCount);
};

io.on('connection', (socket) => {
  console.log('Yeni kullanıcı bağlandı:', socket.id);
  updateAndBroadcastUserCount(); // Yeni bağlantıda sayıyı yayınla

  // Ülke tespiti
  const ip = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
  let geo = geoip.lookup(ip);

  // Yerel test için geçici çözüm: Eğer IP adresi yerel ise rastgele bir ülke ata.
  if (!geo && (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1')) {
    console.log(`Yerel IP (${ip}) tespit edildi. Test için rastgele ülke atanıyor.`);
    const codes = Object.keys(countryList.getCodeList());
    const randomCode = codes[Math.floor(Math.random() * codes.length)];
    geo = { 
      country: randomCode
    };
  }

  const userData = {
    countryCode: geo ? geo.country : 'XX', // XX bilinmeyenler için
    countryName: geo ? countryList.getName(geo.country) : 'Yabancı'
  };
  usersData.set(socket.id, userData);

  // Kullanıcı eşleştirme isteği
  socket.on('findPartner', () => {
    console.log(`${socket.id} eşleştirme arıyor`);
    
    // Kendisiyle eşleşmesini engelle
    waitingUsers.delete(socket.id);

    const availableUsers = Array.from(waitingUsers);

    if (availableUsers.length > 0) {
      // Bekleyen kullanıcı varsa eşleştir
      const partnerId = availableUsers[0];
      waitingUsers.delete(partnerId);
      
      activeConnections.set(socket.id, partnerId);
      activeConnections.set(partnerId, socket.id);
      
      const partnerData = usersData.get(partnerId) || { countryCode: 'XX', countryName: 'Yabancı' };

      socket.emit('partnerFound', { partnerId, partnerInfo: partnerData, initiator: true });
      io.to(partnerId).emit('partnerFound', { partnerId: socket.id, partnerInfo: userData, initiator: false });
      
      console.log(`${socket.id} (${userData.countryCode}) ve ${partnerId} (${partnerData.countryCode}) eşleştirildi`);
    } else {
      // Kimse beklemiyorsa, bu kullanıcıyı bekleme listesine ekle
      waitingUsers.add(socket.id);
      socket.emit('waitingForPartner');
      console.log(`${socket.id} bekleme listesine eklendi.`);
    }
  });

  // 'cancelSearch' olayı için dinleyici
  socket.on('cancelSearch', () => {
    if (waitingUsers.has(socket.id)) {
      waitingUsers.delete(socket.id);
      console.log(`${socket.id} aramayı iptal etti.`);
    }
  });

  // WebRTC sinyal iletimi
  socket.on('offer', (data) => {
    const partnerId = activeConnections.get(socket.id);
    if (partnerId) {
      io.to(partnerId).emit('offer', {
        offer: data.offer,
        from: socket.id
      });
    }
  });

  socket.on('answer', (data) => {
    const partnerId = activeConnections.get(socket.id);
    if (partnerId) {
      io.to(partnerId).emit('answer', {
        answer: data.answer,
        from: socket.id
      });
    }
  });

  socket.on('iceCandidate', (data) => {
    const partnerId = activeConnections.get(socket.id);
    if (partnerId) {
      io.to(partnerId).emit('iceCandidate', {
        candidate: data.candidate,
        from: socket.id
      });
    }
  });

  // Mesaj gönderme
  socket.on('sendMessage', (data) => {
    console.log(`[DEBUG] 'sendMessage' olayı alındı. Gönderen: ${socket.id}, Mesaj: "${data.message}"`);
    const partnerSocketId = activeConnections.get(socket.id);
    
    if (partnerSocketId) {
      console.log(`[DEBUG] Partner bulundu: ${partnerSocketId}. Mesaj iletiliyor...`);
      io.to(partnerSocketId).emit('receiveMessage', { 
        message: data.message,
        senderId: socket.id
      });
      console.log(`[DEBUG] Mesaj başarıyla ${partnerSocketId} ID'li partnere gönderildi.`);
    } else {
      console.log(`[DEBUG] HATA: Gönderen ${socket.id} için partner bulunamadı. activeConnections:`, JSON.stringify(Array.from(activeConnections.entries())));
    }
  });

  // Titreşim gönderme
  socket.on('sendBuzz', () => {
    const partnerSocketId = activeConnections.get(socket.id);
    if (partnerSocketId) {
      io.to(partnerSocketId).emit('receiveBuzz');
    }
  });

  // 'Sonlandır' butonu için: Kullanıcı ayrılır, partner yeni arama başlatır
  socket.on('leaveChat', () => {
    const partnerId = activeConnections.get(socket.id);
    if (partnerId) {
      io.to(partnerId).emit('startNewSearch'); // Partnerin istemcisine yeni arama başlat komutu gönder
      activeConnections.delete(socket.id);
      activeConnections.delete(partnerId);
      console.log(`${socket.id} sohbetten ayrıldı. Partneri (${partnerId}) yeni arama için yönlendirildi.`);
    }
  });

  // 'Sıradaki' butonu için: Her iki kullanıcı da yeni arama başlatır
  socket.on('disconnectPartner', () => {
    const partnerId = activeConnections.get(socket.id);
    if (partnerId) {
      io.to(partnerId).emit('partnerDisconnected'); // Partnerin bağlantısının kesildiğini bildir
      activeConnections.delete(partnerId);
      activeConnections.delete(socket.id);
      console.log(`${socket.id} sohbetten ayrıldı. Partnerine haber verildi.`);
    }
  });

  // Kullanıcı bağlantısı kesildiğinde
  socket.on('disconnect', () => {
    console.log('Kullanıcı ayrıldı:', socket.id);
    
    // Bekleme listesinden çıkar
    waitingUsers.delete(socket.id);
    
    // Aktif bağlantıyı sonlandır
    const partnerId = activeConnections.get(socket.id);
    if (partnerId) {
      io.to(partnerId).emit('partnerDisconnected');
      activeConnections.delete(partnerId);
      activeConnections.delete(socket.id);
      usersData.delete(partnerId); // Ayrılan partnerin verisini temizle
    }
    usersData.delete(socket.id); // Ayrılan kullanıcının verisini temizle
    updateAndBroadcastUserCount(); // Bağlantı kesildiğinde sayıyı yayınla
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server ${PORT} portunda çalışıyor`);
  console.log(`Bekleyen kullanıcılar: ${waitingUsers.size}`);
  console.log(`Aktif bağlantılar: ${activeConnections.size}`);
}); 