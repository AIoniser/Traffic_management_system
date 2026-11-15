import pandas as pd
from pathlib import Path

# Find the Kolkata traffic count CSV
project_folder = Path("Data")

files = list(project_folder.rglob(
    "Processed_Count_and_timining_data.csv"
))

if not files:
    print("CSV file not found. Check the Data folder.")
else:
    file_path = files[0]

    # Read the CSV
    data = pd.read_csv(file_path)

    print("Dataset loaded successfully!")
    print("Shape:", data.shape)

    print("\nColumn names:")
    print(data.columns.tolist())

    print("\nFirst 10 rows:")
    print(data.head(10).to_string())

    print("\nDATA TYPES:")
print(data.dtypes)

print("\nMISSING VALUES:")
print(data.isnull().sum())

print("\nNUMBER OF UNIQUE DATES:")
print(data["Dates"].nunique())

print("\nDATE RANGE:")
print(data["Dates"].min(), "to", data["Dates"].max())

print("\nBASIC STATISTICS:")
print(data.describe())

# Convert Dates from text into actual dates
data["Dates"] = pd.to_datetime(
    data["Dates"],
    format="%d/%m/%Y"
)

print("\nCORRECTED DATE RANGE:")
print(data["Dates"].min())
print(data["Dates"].max())

print("\nOBSERVATIONS PER DATE:")
print(data["Dates"].value_counts().sort_index())