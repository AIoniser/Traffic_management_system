import pandas as pd
import matplotlib.pyplot as plt

# Load the traffic dataset
data = pd.read_csv("Data/Metro_Interstate_Traffic_Volume.csv")

# 1. Display the first five records
print("\nFIRST FIVE RECORDS:")
print(data.head())

# 2. Find the total number of records
print("\nTOTAL RECORDS:")
print(len(data))

# 3. Find average traffic volume
print("\nAVERAGE TRAFFIC VOLUME:")
print(data["traffic_volume"].mean())

# 4. Find the highest traffic volume
print("\nHIGHEST TRAFFIC VOLUME:")
print(data["traffic_volume"].max())

# Convert date_time into proper date and time format
data["date_time"] = pd.to_datetime(data["date_time"])

# Extract the hour from each observation
data["hour"] = data["date_time"].dt.hour

# Calculate average traffic for each hour
hourly_traffic = data.groupby("hour")["traffic_volume"].mean()

# Draw the graph
plt.figure(figsize=(10, 5))

plt.plot(hourly_traffic.index, hourly_traffic.values, marker="o")

plt.title("Average Traffic Volume Throughout the Day")
plt.xlabel("Hour of the Day")
plt.ylabel("Average Traffic Volume")

plt.xticks(range(24))
plt.grid(True)

plt.show()

# Extract the day of the week
data["day"] = data["date_time"].dt.day_name()

# Calculate average traffic for each day
daily_traffic = data.groupby("day")["traffic_volume"].mean()

# Arrange days in the correct order
day_order = [
    "Monday", "Tuesday", "Wednesday",
    "Thursday", "Friday", "Saturday", "Sunday"
]

daily_traffic = daily_traffic.reindex(day_order)

# Create the graph
plt.figure(figsize=(10, 5))

plt.bar(daily_traffic.index, daily_traffic.values)

plt.title("Average Traffic Volume by Day")
plt.xlabel("Day of the Week")
plt.ylabel("Average Traffic Volume")

plt.xticks(rotation=30)
plt.grid(axis="y")

plt.show()
# Group traffic observations by rainfall
rainfall_traffic = data.groupby("rain_1h")["traffic_volume"].mean()

# Create the graph
plt.figure(figsize=(10, 5))

plt.scatter(
    rainfall_traffic.index,
    rainfall_traffic.values
)

plt.title("Rainfall vs Average Traffic Volume")
plt.xlabel("Rainfall (mm)")
plt.ylabel("Average Traffic Volume")

plt.grid(True)
plt.show()

# Find the 10 highest rainfall observations
print("\nHIGHEST RAINFALL RECORDS:")

print(
    data.nlargest(10, "rain_1h")[
        ["date_time", "rain_1h", "traffic_volume"]
    ]
)
# Find rainfall observations greater than 50 mm
suspicious_rain = data[data["rain_1h"] > 50]

print("\nSUSPICIOUS RAINFALL OBSERVATIONS:")
print(suspicious_rain[
    ["date_time", "rain_1h", "traffic_volume"]
])

print("\nNUMBER OF SUSPICIOUS RECORDS:")
print(len(suspicious_rain))