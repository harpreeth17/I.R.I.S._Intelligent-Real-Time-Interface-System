import numpy as np


class KalmanFilter2D:
    def __init__(self):
        self.x = np.zeros((4, 1), dtype=np.float64)
        self.P = np.eye(4, dtype=np.float64) * 1000.0
        self.H = np.array([[1, 0, 0, 0], [0, 1, 0, 0]], dtype=np.float64)
        self.R = np.eye(2, dtype=np.float64) * 30.0
        self.Q_base = np.eye(4, dtype=np.float64) * 0.05

    def predict(self, dt: float):
        F = np.array(
            [[1, 0, dt, 0], [0, 1, 0, dt], [0, 0, 1, 0], [0, 0, 0, 1]],
            dtype=np.float64,
        )
        self.x = F @ self.x
        self.P = F @ self.P @ F.T + self.Q_base

    def update(self, z):
        z = np.array(z, dtype=np.float64).reshape((2, 1))
        y = z - self.H @ self.x
        S = self.H @ self.P @ self.H.T + self.R
        K = self.P @ self.H.T @ np.linalg.inv(S)
        self.x = self.x + K @ y
        I = np.eye(4, dtype=np.float64)
        self.P = (I - K @ self.H) @ self.P

    def step(self, measurement, dt: float):
        self.predict(dt)
        self.update(measurement)
        return float(self.x[0, 0]), float(self.x[1, 0])
