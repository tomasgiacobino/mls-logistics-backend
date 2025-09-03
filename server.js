const express = require('express');
const mercadopago = require('mercadopago');
const dotenv = require('dotenv');

dotenv.config(); // Carga las variables de entorno del archivo .env

const app = express();
const port = process.env.PORT || 5000;

// Configuración de Mercado Pago
mercadopago.configure({
    access_token: process.env.MERCADOPAGO_ACCESS_TOKEN
});

// Middleware para procesar JSON en las solicitudes
app.use(express.json());

// Endpoint para crear la preferencia de pago
app.post('/create-order', async (req, res) => {
    try {
        const preference = {
            items: [
                {
                    title: 'Asesoramiento personalizado',
                    unit_price: 100, // Precio del asesoramiento
                    quantity: 1,
                }
            ],
            back_urls: {
                success: 'http://localhost:3000/success',
                failure: 'http://localhost:3000/failure',
                pending: 'http://localhost:3000/pending'
            },
            auto_return: 'approved'
        };

        const response = await mercadopago.preferences.create(preference);
        res.status(200).json({ id: response.body.id });

    } catch (error) {
        console.error('Error al crear la preferencia de pago:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.listen(port, () => {
    console.log(`Servidor de Mercado Pago escuchando en el puerto ${port}`);
});