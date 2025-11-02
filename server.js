const express = require('express');
const {MercadoPagoConfig, Preference, Payment} =  require('mercadopago');
const cors = require('cors');
const crypto = require('crypto');

require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// Configuración de Mercado Pago
const client = new MercadoPagoConfig({ 
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
    sandbox: true
});
const preference = new Preference(client);
const paymentApi = new Payment(client);

// Primero: raw body para /webhook
app.use('/webhook', express.raw({ type: 'application/json' }));

// Middleware para procesar JSON en las solicitudes
app.use(express.json()); // Aplica a todo excepto donde se sobrescriba
app.use(cors());

// Endpoint para crear la preferencia de pago
app.post('/create-order', async (req, res) => {
    try {
        const result = await preference.create({
            body: {
                items: [
                    {
                        title: 'Asesoramiento personalizado',
                        unit_price: 100,
                        quantity: 1,
                    }
                ],
                back_urls: {
                    success: "https://mls-logistics-frontend-j3x1.vercel.app/success",
                    failure: "https://mls-logistics-frontend-j3x1.vercel.app/failure",
                    pending: "https://mls-logistics-frontend-j3x1.vercel.app/pending",
                },
                auto_return: "approved",
                notification_url: "https://mls-logistics-backend.onrender.com/webhook"
            }
        });
        console.log('Respuesta de la API de mercado pago:', result)
        res.status(200).json({ id: result.id, sandbox_init_point: result.sandbox_init_point });
    } catch (error) {
        console.error('Error al crear la preferencia de pago:', error.response?.data || error.message);
        res.status(500).json({ error: 'Error interno del servidor', details: error.response?.data });
    }
});

app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  // 1) Confirmar recepción inmediatamente (obligatorio por MP)
  res.status(200).json({ received: true });

  // 2) Procesar asíncronamente
  setImmediate(async () => {
      try {
          const rawBody = req.body.toString('utf8');
          const payload = JSON.parse(rawBody);

                // En tu webhook, justo después de rawBody
        console.log('🔍 Raw body:', rawBody);
        console.log('🔍 Parsed payload:', payload);

          // Solo procesamos notificaciones de pago
          if (payload.type !== 'payment') {
              console.log('ℹ️ Webhook ignorado por type:', payload.type);
              return;
          }

          const paymentId = payload.data?.id;
          if (!paymentId) {
              console.warn('⚠️ Webhook recibido sin data.id. Body:', payload);
              return;
          }

          // ✅ Validación manual de firma (corregida)
          const secretKey = process.env.MERCADOPAGO_WEBHOOK_SECRET;
          if (!secretKey) {
              console.warn('⚠️ No hay secretKey configurado. Saltando validación.');
          } else {
              const signatureHeader = String(req.headers['x-signature'] || '');
              const requestId = String(req.headers['x-request-id'] || '');

              // Parsear x-signature
              const parts = {};
              signatureHeader.split(',').forEach(part => {
                  const [key, value] = part.split('=');
                  if (key && value) parts[key.trim()] = value.trim();
              });

              const ts = parts.ts;
              const v1 = parts.v1;

              if (!ts || !v1 || !requestId) {
                  console.error('❌ Headers de firma incompletos.', {
                      xSignature: signatureHeader,
                      xRequestId: requestId,
                  });
                  return;
              }

              // String to sign según docs MP
              const stringToSign = `id:${paymentId};request-id:${requestId};ts:${ts};`;
              const computed = crypto
                  .createHmac('sha256', secretKey)
                  .update(stringToSign)
                  .digest('hex');

              if (computed !== v1) {
                  console.error('❌ Firma inválida en webhook. Posible intento de falsificación.', {
                      stringToSign,
                      computed,
                      v1,
                  });
                  return;
              }
          }

          // Obtener detalles del pago con reintentos
          const maxAttempts = 3;
          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
              try {
                  const payment = await paymentApi.get({ id: paymentId });
                  console.log('✅ Pago verificado:', {
                      id: payment.id,
                      status: payment.status,
                      amount: payment.transaction_amount,
                      payer_email: payment.payer?.email
                  });

                  // 💡 Aquí va tu lógica de negocio:
                  // - Actualizar base de datos
                  // - Enviar email
                  // - Habilitar acceso al usuario
                  // - etc.

                  break; // éxito, salir del bucle

              } catch (error) {
                  const message = error?.response?.data?.message || error.message;
                  if (attempt < maxAttempts) {
                      const delay = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
                      console.warn(`⌛ Intento ${attempt}/${maxAttempts}: Payment no disponible. Reintentando en ${delay}ms`, { paymentId, message });
                      await new Promise(r => setTimeout(r, delay));
                      continue;
                  }
                  console.error('❌ Error final al obtener pago:', message);
              }
          }

      } catch (error) {
          console.error('❌ Error al procesar webhook:', error);
      }
  });
});

// Endpoint para verificar el estado de un pago (sin base de datos)
app.get('/api/verify-payment/:id', async (req, res) => {
    try {
        const paymentId = req.params.id;
        const payment = await paymentApi.get({ id: paymentId });

        // Solo consideramos "aprobado" como válido
        const verified = payment.status === 'approved';

        res.json({
            verified,
            status: payment.status,
            amount: payment.transaction_amount,
            payer_email: payment.payer?.email
        });
    } catch (error) {
        console.error('Error al verificar pago:', error.message);
        res.status(404).json({ verified: false, error: 'Pago no encontrado' });
    }
});


app.listen(port, () => {
    console.log(`Servidor de Mercado Pago escuchando en el puerto ${port}`);
});