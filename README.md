# dispatcher

1. fetches packages and drones (arrays of objects) from an API
2. loops through these collections and calculates the time for each member to reach the depot (for a package or a drone not already carrying a package, this is a direct trip; for a drone already carrying a package, this is a trip to its current destination, then to the depot)
3. stores the time for each trip in a new property on the object
4. sorts the array by that property, in ascending order
5. with the packages and drones sorted, loops through the packages array in reverse (beginning with the package with the longest travel time to the depot)
6. for each package, loops through the drones array, and for each drone, if it hasn’t already been assigned another package, i.e., if it’s not busy (see below), calculates the travel time for the drone to pick up the package from the depot and deliver it to its destination and adds that duration to the current time (UTC)
7. if the arrival time is on or before the deadline, assigns the drone to the package and adds the drone to the ‘busy’ array; if no drone can make the delivery on time, adds the package to the ‘unassigned’ array
8. displays the results in the browser in a simple layout
