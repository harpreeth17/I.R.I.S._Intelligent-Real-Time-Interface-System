import asyncio
import json
import websockets

async def run():
    uri = 'ws://localhost:8765'
    async with websockets.connect(uri) as ws:
        print('Connected')
        count = 0
        while count < 60:
            raw = await ws.recv()
            try:
                data = json.loads(raw)
            except Exception:
                continue
            if data.get('type') == 'telemetry':
                print(f"#{count} cursor={data.get('cursor')} predicted={data.get('predictedRaw')} rawIris={data.get('rawIris')} calibrated={data.get('status',{}).get('calibrated')}")
                count += 1

asyncio.run(run())
