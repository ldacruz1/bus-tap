Quick start
-----------
1) Copy this folder to your Raspberry Pi (e.g., scp or git).
2) On the Pi, enable I2C and SPI (raspi-config) and install Docker.
   sudo raspi-config nonint do_i2c 0
   sudo raspi-config nonint do_spi 0
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER
3) cd into the folder and create your .env / drivers.json
   cp .env.example .env
   nano rfid-reader/drivers.json
4) Build and run:
   docker compose up --build
5) Passenger page:
   http://<PI_IP>:8080/
6) Test without a card:
   curl -X POST http://<PI_IP>:8000/events -H 'Content-Type: application/json' -d '{"driver_id":"sim-001","bus_id":"B12","status":"leaving"}'
