import asyncio
import websockets

async def run():
    uri = 'ws://localhost:8765'
    try:
        async with websockets.connect(uri) as ws:
            print('Connected to backend')
            count = 0
            while count < 10:
                raw = await ws.recv()
                print(raw)
                count += 1
    except Exception as e:
        print('Client error:', e)

if __name__ == '__main__':
    asyncio.run(run())
