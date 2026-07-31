import asyncio
import websockets
import json

async def run():
    uri = 'ws://localhost:8765'
    async with websockets.connect(uri) as ws:
        print('Connected')
        await ws.send(json.dumps({'type':'start_calibration'}))
        print('Sent start_calibration')
        for _ in range(20):
            msg = await ws.recv()
            print(msg)

if __name__ == '__main__':
    asyncio.run(run())
