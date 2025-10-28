const express = require('express');
const {MercadoPagoConfig, Preference} =  require('mercadopago');
const cors = require('cors');

require('dotenv').config(); // Carga las variables de entorno del archivo .env

const app = express();
const port = process.env.PORT || 5000;

// Configuración de Mercado Pago
const client = new MercadoPagoConfig({ 
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
    sandbox: true
});
const preference = new Preference(client);

// Middleware para procesar JSON en las solicitudes
app.use(express.json());
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
                    success: "https://1397933b5c5c.ngrok-free.app/success",
                    failure: "https://1397933b5c5c.ngrok-free.app/failure",
                    pending: "https://1397933b5c5c.ngrok-free.app/pending",
                },
                auto_return: "approved"
            }
        });
        console.log('Respuesta de la API de mercado pago:', result)
        res.status(200).json({ id: result.id, sandbox_init_point: result.sandbox_init_point });
    } catch (error) {
        console.error('Error al crear la preferencia de pago:', error.response?.data || error.message);
        res.status(500).json({ error: 'Error interno del servidor', details: error.response?.data });
    }
});

app.listen(port, () => {
    console.log(`Servidor de Mercado Pago escuchando en el puerto ${port}`);
});