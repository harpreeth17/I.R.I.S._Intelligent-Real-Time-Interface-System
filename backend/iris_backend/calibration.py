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

    def fit(self, iris_samples, screen_points):
        X = np.asarray(iris_samples, dtype=np.float64)
        y = np.asarray(screen_points, dtype=np.float64)

        X_poly = self.poly.fit_transform(X)
        self.model_x.fit(X_poly, y[:, 0])
        self.model_y.fit(X_poly, y[:, 1])
        self.fitted = True

        pred_x = self.model_x.predict(X_poly)
        pred_y = self.model_y.predict(X_poly)
        pred = np.stack([pred_x, pred_y], axis=1)
        error = np.linalg.norm(pred - y, axis=1)
        rmse = float(np.sqrt(np.mean(error**2)))
        return {'rmse': rmse, 'sampleCount': int(len(X))}

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
