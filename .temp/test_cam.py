import cv2
import time

backends = []
if hasattr(cv2, 'CAP_DSHOW'):
    backends.append(('CAP_DSHOW', cv2.CAP_DSHOW))
if hasattr(cv2, 'CAP_MSMF'):
    backends.append(('CAP_MSMF', cv2.CAP_MSMF))
backends.append(('CAP_ANY', cv2.CAP_ANY))

for name, backend in backends:
    print('\nTesting backend:', name, backend)
    try:
        cap = cv2.VideoCapture(0, backend)
        cap.set(cv2.CAP_PROP_FPS, 30)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        print('isOpened:', cap.isOpened())
        for i in range(5):
            ok, frame = cap.read()
            print(f' frame {i}:', ok, None if frame is None else frame.shape)
            time.sleep(0.1)
        cap.release()
    except Exception as e:
        print(' error testing backend', name, e)

print('\nTest complete')
