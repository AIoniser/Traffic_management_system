import pandas as pd
from pathlib import Path

files = list(Path("Data").rglob(
    "Processed_Vehicle_Headway.csv"
))

if not files:
    print("File not found!")
else:
    data = pd.read_csv(files[0])

    print("Dataset loaded!")
    print("Shape:", data.shape)

    print("\nColumns:")
    print(data.columns.tolist())

    print("\nFirst 10 rows:")
    print(data.head(10).to_string())

    print("\nData types:")
    print(data.dtypes)

    print("\nMissing values:")
    print(data.isnull().sum())

    print("\nUNIQUE OBSERVATION DATES:")
print(data["Dates"].value_counts())

print("\nHEADWAY STATISTICS:")
print(data[["HeadDelay", "PhaseDuration",
            "rPhaseDuration", "LinkCount",
            "est_LinkCount"]].describe())

print("\nACCURACY STATISTICS:")
print(data["sAccuracy"].describe())