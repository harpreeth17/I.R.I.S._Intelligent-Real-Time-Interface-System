import numpy as np
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import PolynomialFeatures


class PolynomialCalibrator:
    def __init__(self, degree: int = 2):
        self.degree = degree
        self.poly = PolynomialFeatures(degree=degree)
        self.model_x = LinearRegression()
        self.model_y = LinearRegression()
        self.fitted = False

    @staticmethod
    def filter_samples(samples, minimum_count: int = 8):
        values = np.asarray(samples, dtype=np.float64)
        if values.ndim != 2 or len(values) == 0:
            return np.empty((0, 0), dtype=np.float64)
        center = np.median(values, axis=0)
        deviation = np.abs(values - center)
        mad = np.median(deviation, axis=0)
        threshold = np.maximum(3.5 * mad, 0.025)
        inliers = np.all(deviation <= threshold, axis=1)
        filtered = values[inliers]
        if len(filtered) < minimum_count:
            return np.empty((0, values.shape[1]), dtype=np.float64)
        return filtered

    def fit(self, iris_samples, screen_points):
        X = np.asarray(iris_samples, dtype=np.float64)
        y = np.asarray(screen_points, dtype=np.float64)
        if X.ndim != 2 or y.ndim != 2 or len(X) != len(y) or len(X) < 6:
            raise ValueError('At least six matching calibration samples are required')

        X_poly = self.poly.fit_transform(X)
        self.model_x.fit(X_poly, y[:, 0])
        self.model_y.fit(X_poly, y[:, 1])

        pred_x = self.model_x.predict(X_poly)
        pred_y = self.model_y.predict(X_poly)
        pred = np.stack([pred_x, pred_y], axis=1)
        error = np.linalg.norm(pred - y, axis=1)
        # A bad landmark frame can otherwise dominate a target's average. Refit
        # once after removing only statistically extreme residuals.
        median_error = float(np.median(error))
        mad = float(np.median(np.abs(error - median_error)))
        threshold = max(24.0, median_error + 3.5 * max(mad, 1.0))
        inliers = error <= threshold
        if int(np.count_nonzero(inliers)) >= 6 and int(np.count_nonzero(inliers)) < len(X):
            X = X[inliers]
            y = y[inliers]
            X_poly = self.poly.fit_transform(X)
            self.model_x.fit(X_poly, y[:, 0])
            self.model_y.fit(X_poly, y[:, 1])
            pred = np.stack(
                [self.model_x.predict(X_poly), self.model_y.predict(X_poly)],
                axis=1,
            )
            error = np.linalg.norm(pred - y, axis=1)
        self.fitted = True
        rmse = float(np.sqrt(np.mean(error**2)))
        return {
            'rmse': rmse,
            'sampleCount': int(len(X)),
            'rejectedCount': int(len(iris_samples) - len(X)),
        }

    def validate(self, iris_samples, screen_points):
        X = np.asarray(iris_samples, dtype=np.float64)
        y = np.asarray(screen_points, dtype=np.float64)
        if not self.fitted or len(X) == 0:
            return {'rmse': None, 'sampleCount': 0}
        predictions = np.asarray([self.predict(sample) for sample in X])
        error = np.linalg.norm(predictions - y, axis=1)
        return {
            'rmse': float(np.sqrt(np.mean(error**2))),
            'sampleCount': int(len(X)),
        }

    def predict(self, iris_vector):
        if not self.fitted:
            return None
        X = np.asarray(iris_vector, dtype=np.float64).reshape(1, -1)
        X_poly = self.poly.transform(X)
        x = float(self.model_x.predict(X_poly)[0])
        y = float(self.model_y.predict(X_poly)[0])
        return x, y

    def to_dict(self):
        return {
            'degree': self.degree,
            'poly': self.poly,
            'model_x': self.model_x,
            'model_y': self.model_y,
            'fitted': self.fitted,
        }

    @classmethod
    def from_dict(cls, data):
        inst = cls(degree=data.get('degree', 2))
        inst.poly = data['poly']
        inst.model_x = data['model_x']
        inst.model_y = data['model_y']
        inst.fitted = data.get('fitted', True)
        return inst
