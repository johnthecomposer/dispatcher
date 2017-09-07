const dsp = (function($) {
     const mode = 'development';
     const km_speed = 20;
     const pkg_limit = 1;
     const url = '(url of api)';
     return {
          depot: {
               latitude: -37.8162738,
               longitude: 144.9636947
          },
          dispatcher: {
               busy: [], // droneIds
               unassigned: [], // packageIds
               assignments: [] // objects, packageIds with corresponding droneIds
          },
          showmode: function(){
               $('#mode-message').text('currently running in ' + mode + ' mode.');
               // $('#mode-message').text('currently running in  mode.');
          },
          // Source: https://developers.google.com/web/fundamentals/getting-started/primers/promises#promisifying_xmlhttprequest
          get: function(data_set_name) {
               return new Promise(function(resolve, reject) {
                    if(mode === 'development'){
                         resolve(data[data_set_name]);
                    }
                    else{
                         var req = new XMLHttpRequest();
                         req.open('GET', url + data_set_name);
                         req.responseType = 'json';
                         req.onload = function() {
                              if (req.status == 200) {
                                   //console.log(JSON.parse(req.response))
                                   var parsed = JSON.parse(req.response);
                                   $('#' + data_set_name + '.data').text(JSON.stringify(parsed, null, 4));
                                   resolve(parsed);
                              } else {
                                   reject(Error(req.statusText));
                              }
                         };
                         req.onerror = function() {
                              reject(Error("Network Error"));
                         };
                         req.send();
                    }
               });
          },
          // Haversine formula - calculates the difference (as the crow flies) between two points given coordinates (latitude and longitude)
          // Source: https://stackoverflow.com/questions/1502590/calculate-distance-between-two-points-in-google-maps-v3
          tripDistance: function(p1, p2) {
               var rad = function(x) {
                    return x * Math.PI / 180;
               };
               var R = 6378137; // Earth’s mean radius in meters
               var dLat = rad(p2.latitude - p1.latitude);
               var dLong = rad(p2.longitude - p1.longitude);
               var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                    Math.cos(rad(p1.latitude)) * Math.cos(rad(p2.latitude)) *
                    Math.sin(dLong / 2) * Math.sin(dLong / 2);
               var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
               var d = R * c;
               return d; // distance in meters
          },
          tripMilliseconds: function(meters, destination_name, locations, deadline) {
               destination_name = destination_name || 'destination';
               deadline = deadline || 'n/a';
               km_distance = meters / 1000;
               var h = km_distance / km_speed;
               var m = h * 60;
               var s = m * 60;
               var ms = Math.round(s * 1000);
               // console.log('distance in meters: ' + meters + '; kilometers: ' + km_distance.toFixed(2) + '; drone is traveling at ' + km_speed + 'km/hour; trip time to ' + destination_name + ' is ' + moment.duration(ms).humanize() + '; deadline is ' + deadline);
               return ms;
          },
          dispatch: function() {
               $('#dispatch').prop('disabled', true).addClass('disabled');
               $('#last-updated').text('fetching data...');
               $('body').addClass('loading');
               dsp.dispatcher.busy = [];
               dsp.dispatcher.unassigned = [];
               dsp.dispatcher.assignments = [];


               // *** fetch *** //


               // get with Promise.all
               // Source: https://stackoverflow.com/questions/32828415/how-to-run-multiple-async-functions-then-execute-callback
               Promise.all([dsp.get('packages'),
                         dsp.get('drones')
                    ])
                    .then(function(response) {
                         console.log('response')
                         console.log(response)
                         var packages = response[0];
                         var drones = response[1];

                         // loop through packages
                         // get time from depot to destination
                         for (var p = 0; p < packages.length; p++) {
                              var this_package = packages[p];
                              if(mode === 'development'){this_package.deadline = moment().unix() +
                                   ((Math.floor(Math.random() * ((41 + 35) - (28 + 29) + 1)) + (28 + 29)) * 60)};
                              console.log('package deadline: ' + this_package.deadline);
                              var final_destination = this_package.destination;
                              var meters_to_destination = dsp.tripDistance(dsp.depot, final_destination)
                              var milliseconds_to_destination = dsp.tripMilliseconds(meters_to_destination, 'final destination', JSON.stringify([dsp.depot, final_destination]), moment.unix(packages[p].deadline).format('MMMM Do YYYY, h:mm:ss a'));
                              // set that value on that package in the packages object
                              this_package.depot_to_destination = milliseconds_to_destination;
                              this_package.depot_to_destination_pretty = moment.duration(milliseconds_to_destination).humanize(); // remove
                         }
                         for (var d = 0; d < drones.length; d++) {
                              var this_drone = drones[d];
                              var drone_location = this_drone.location;
                              var milliseconds_to_pending_destination = 0;
                              // Drones might already be carrying a package.
                              if (this_drone.packages.length) {
                                   // Once a drone is assigned a package, it will fly in a straight line to its current destination (if it already has a package), ...
                                   var pending_destination = this_drone.packages[0].destination;
                                   var meters_to_pending_destination = dsp.tripDistance(drone_location, pending_destination);
                                   //  The time to deliver this package should be taken into account when comparing drones.
                                   milliseconds_to_pending_destination = dsp.tripMilliseconds(meters_to_pending_destination, 'pending destination', JSON.stringify([drone_location, pending_destination]));
                                   drone_location = pending_destination;
                              }
                              // ...then to the depo, ...
                              var drone_meters_to_depot = dsp.tripDistance(drone_location, dsp.depot);
                              var drone_milliseconds_to_depot = dsp.tripMilliseconds(drone_meters_to_depot, 'depot', JSON.stringify([drone_location, dsp.depot]));
                              this_drone.location_to_depot = milliseconds_to_pending_destination + drone_milliseconds_to_depot;
                              this_drone.location_to_depot_pretty = moment.duration(milliseconds_to_pending_destination + drone_milliseconds_to_depot).humanize();
                         }
                         // sort drones by trip time to depot (including trip time to pending destination
                         // if applicable), ascending
                         drones.sort(function(a, b) {
                              return a.location_to_depot - b.location_to_depot;
                         });
                         // sort packages by trip time to final destination, ascending
                         packages.sort(function(a, b) {
                              return a.depot_to_destination - b.depot_to_destination;
                         });



                         // *** dispatch *** //


                         // loop through packages in reverse, i.e., from the longest trip time to final destination to the shortest
                         for (var p = (packages.length - 1); p > -1; p--) {
                              var is_assigned = false;
                              var deadline_timestamp = packages[p].deadline;
                              var deadline_utc = moment.unix(deadline_timestamp).utc();
                              var deadline_pretty = deadline_utc.format('MMMM Do YYYY, h:mm:ss a') + ' UTC';
                              // loop through drones from the drone with the shortest trip time to the depot to the longest
                              for (var d = 0; d < drones.length; d++) {
                                   // check if drone already has an assignment
                                   var is_busy = dsp.dispatcher.busy.indexOf(drones[d].droneId) !== -1;
                                   if(!is_busy){
                                        var trip_time = drones[d].location_to_depot + packages[p].depot_to_destination;
                                        // console.log('total trip time for droneId ' + drones[d].droneId + ': ' + ((trip_time / 1000) / 60).toFixed(2) + ' minutes');
                                        // moment.duration(trip_time).format('mm:ss')
                                        var arrival_timestamp = Math.round((moment().utc().add(trip_time, 'milliseconds').valueOf()) / 1000);
                                        var arrival_utc = moment().utc().add(trip_time, 'milliseconds');
                                        var arrival_pretty = arrival_utc.format('MMMM Do YYYY, h:mm:ss a') + ' UTC';
                                        var diff = deadline_utc.diff(arrival_utc);
                                        // Packages must only be assigned to a drone that can complete the delivery by the package's delivery deadline
                                        // assign the first drone with a delivery time at or before the package delivery deadline to that package
                                        if(diff >= 0){
                                             dsp.dispatcher.busy.push(drones[d].droneId);
                                             drones[d].next_assignment = packages[p];
                                             dsp.dispatcher.assignments.push({
                                                  packageId: packages[p].packageId,
                                                  droneId: drones[d].droneId
                                             });
                                             // break out of the inner loop; an assignment has been made
                                             is_assigned = true;
                                             break;
                                        }
                                   }
                              }
                              // no drone can deliver the package on time; add its id to the unassigned array
                              !is_assigned && dsp.dispatcher.unassigned.indexOf(packages[p].packageId) === -1 ? dsp.dispatcher.unassigned.push(packages[p].packageId) : '';
                              console.log('deadline for packageId ' + packages[p].packageId + ': ' + deadline_pretty +
                                   '; arrival: ' + arrival_pretty + '; time diff: ' +
                                   moment.duration(diff).humanize() +
                                   (is_assigned ? ' on/before deadline. Assigned! ' : ' after deadline '));
                         }

                         $('#packages .data').text(JSON.stringify(packages, null, 4));
                         $('#drones .data').text(JSON.stringify(drones, null, 4));
                         $('#unassigned .data').text(JSON.stringify(dsp.dispatcher.unassigned, null, 4));
                         $('#assigned .data').text(JSON.stringify(dsp.dispatcher.assignments, null, 4));

                         console.log('packages');
                         console.log(packages);
                         console.log('drones');
                         console.log(drones);
                         console.log('dsp.dispatcher.unassigned');
                         console.log(dsp.dispatcher.unassigned);
                         console.log('dsp.dispatcher.busy');
                         console.log(dsp.dispatcher.busy);
                         console.log('dsp.dispatcher.assignments');
                         console.log(dsp.dispatcher.assignments);

                         $('#packages .count').text('[' + packages.length + ']');
                         $('#drones .count').text('[' + drones.length + ']');
                         $('#unassigned .count').text('[' + dsp.dispatcher.unassigned.length + ']');
                         $('#assigned .count').text('[' + dsp.dispatcher.assignments.length + ']');

                         $('#dispatch').prop('disabled', false).removeClass('disabled');
                         $('body').removeClass('loading');
                         $('#last-updated').text('last updated: ' + moment().utc().format('MMMM Do YYYY, h:mm:ss a') + ' UTC');
                    });
          }
     }
})(jQuery);

$(document).ready(function() {
     dsp.showmode();
     $('#dispatch').click(function(){dsp.dispatch()});
     $('#dispatch').trigger('click');
});
